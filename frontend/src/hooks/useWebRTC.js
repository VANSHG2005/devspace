import { useRef, useState, useCallback, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { getSocket, EVENTS } from '../utils/socket'

// ── TURN credentials ──────────────────────────────────────────────────────────
// Reads from Vercel env vars — supports both self-hosted CoTURN and Metered
// VITE_TURN_URL  = your CoTURN server hostname e.g. devspace-turn.onrender.com
// VITE_TURN_USER = username you set in Render env vars
// VITE_TURN_PASS = password you set in Render env vars
const TURN_URL  = import.meta.env.VITE_TURN_URL  || 'standard.relay.metered.ca'
const TURN_USER = import.meta.env.VITE_TURN_USER || ''
const TURN_PASS = import.meta.env.VITE_TURN_PASS || ''

const buildICE = () => {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  if (TURN_USER && TURN_PASS) {
    servers.push(
      { urls: `turn:${TURN_URL}:3478`,                username: TURN_USER, credential: TURN_PASS },
      { urls: `turn:${TURN_URL}:3478?transport=tcp`,  username: TURN_USER, credential: TURN_PASS },
      { urls: `turn:${TURN_URL}:443`,                 username: TURN_USER, credential: TURN_PASS },
    )
    console.log('[RTC] TURN server:', TURN_URL)
  } else {
    console.warn('[RTC] ⚠️  No TURN credentials set — cross-device calls may fail on restricted networks')
  }

  return { iceServers: servers, iceCandidatePoolSize: 10 }
}

const ICE_CONFIG = buildICE()

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl:  { ideal: true },
    // Explicitly request high-pass filter to cut low-frequency noise
    highpassFilter:   { ideal: true },
    sampleRate:       48000,
    channelCount:     1,
    // Latency hint - 'speech' optimizes for voice calls
    latency:          0.01,
  },
  video: false,
}

export const useWebRTC = (workspaceId, setMediaStreams) => {
  const { user } = useSelector(s => s.auth)
  const { onlineUsers } = useSelector(s => s.workspace)

  // Use refs so all callbacks always read latest values without re-creating
  const onlineUsersRef = useRef([])
  const userRef = useRef(null)
  useEffect(() => { onlineUsersRef.current = onlineUsers || [] }, [onlineUsers])
  useEffect(() => { userRef.current = user }, [user])

  const [micOn, setMicOn]       = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)

  const localAudioRef   = useRef(null)
  const screenStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)

  const voicePeers  = useRef({})
  const screenPeers = useRef({})
  const cameraPeers = useRef({})

  const audioElements = useRef([])

  // ── Play remote audio ───────────────────────────────────────────────────
  const playAudio = (stream) => {
    const audio = new Audio()
    audio.srcObject = stream
    audio.autoplay  = true
    audio.muted     = false
    audio.volume    = 1.0
    audio.play().catch(e => console.warn('[RTC] audio.play():', e.message))
    audioElements.current.push(audio)
    stream.getTracks().forEach(t => {
      t.onended = () => {
        audio.pause()
        audioElements.current = audioElements.current.filter(a => a !== audio)
      }
    })
  }

  // ── Build a peer connection ─────────────────────────────────────────────
  const makePeer = (peerId, kind) => {
    const pc = new RTCPeerConnection(ICE_CONFIG)
    pc.onconnectionstatechange = () => {
      console.log(`[RTC] ${kind} → ${peerId}: ${pc.connectionState}`)
      if (pc.connectionState === 'failed') pc.restartIce()
    }
    pc.oniceconnectionstatechange = () =>
      console.log(`[RTC] ICE ${kind} → ${peerId}: ${pc.iceConnectionState}`)
    return pc
  }

  // ── Signal handlers (stable — use refs) ────────────────────────────────
  const voicePeersRef  = voicePeers
  const screenPeersRef = screenPeers
  const cameraPeersRef = cameraPeers

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const onSignal = async ({ from, fromName, signal, type }) => {
      if (!from || from === userRef.current?.id) return
      console.log('[RTC] signal:', type, 'from', fromName || from)

      try {
        if      (type === 'voice-offer')   await handleVoiceOffer(from, signal)
        else if (type === 'voice-answer')  await applyAnswer(voicePeersRef.current[from], signal)
        else if (type === 'screen-offer')  await handleMediaOffer(from, fromName, signal, 'screen')
        else if (type === 'screen-answer') await applyAnswer(screenPeersRef.current[from], signal)
        else if (type === 'camera-offer')  await handleMediaOffer(from, fromName, signal, 'camera')
        else if (type === 'camera-answer') await applyAnswer(cameraPeersRef.current[from], signal)
        else if (type === 'ice-voice')     await addIce(voicePeersRef.current[from], signal)
        else if (type === 'ice-screen')    await addIce(screenPeersRef.current[from], signal)
        else if (type === 'ice-camera')    await addIce(cameraPeersRef.current[from], signal)
      } catch (e) {
        console.error('[RTC] signal error:', e)
      }
    }

    socket.on(EVENTS.WEBRTC_SIGNAL, onSignal)

    // ── When a new user joins, re-offer any active streams to them ──
    const onUserJoined = async (userData) => {
      const userId = userData.userId || userData.id
      const name = userData.name
      if (!userId || userId === userRef.current?.id) return
      console.log('[RTC] new user joined:', name, '— re-offering active streams')
      const me = userRef.current

      const offerToOne = async (stream, peersRef, kind) => {
        if (!stream) return
        try {
          if (peersRef.current[userId]) peersRef.current[userId].close()
          const pc = makePeer(userId, kind)
          peersRef.current[userId] = pc
          stream.getTracks().forEach(t => pc.addTrack(t, stream))
          pc.onicecandidate = ({ candidate }) => {
            if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: userId, signal: candidate, type: `ice-${kind}` })
          }
          if (kind === 'voice') {
            pc.ontrack = ({ streams }) => { if (streams?.[0]) playAudio(streams[0]) }
          }
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: userId, fromName: me?.name, signal: offer, type: `${kind}-offer` })
          console.log(`[RTC] re-offered ${kind} to new joiner ${name}`)
        } catch(e) { console.error('[RTC] offerToOne error:', e) }
      }

      // Short delay so new user's socket is fully ready to receive
      setTimeout(async () => {
        if (localAudioRef.current)   await offerToOne(localAudioRef.current,   voicePeersRef,  'voice')
        if (screenStreamRef.current) await offerToOne(screenStreamRef.current, screenPeersRef, 'screen')
        if (cameraStreamRef.current) await offerToOne(cameraStreamRef.current, cameraPeersRef, 'camera')
      }, 1500)
    }

    socket.on(EVENTS.USER_JOINED, onUserJoined)
    return () => {
      socket.off(EVENTS.WEBRTC_SIGNAL, onSignal)
      socket.off(EVENTS.USER_JOINED, onUserJoined)
    }
  }, [])  // empty deps — uses refs throughout

  const applyAnswer = async (pc, signal) => {
    if (!pc || pc.signalingState === 'closed' || pc.signalingState === 'stable') return
    await pc.setRemoteDescription(new RTCSessionDescription(signal))
  }

  const addIce = async (pc, signal) => {
    if (!pc || pc.signalingState === 'closed') return
    try { await pc.addIceCandidate(new RTCIceCandidate(signal)) } catch {}
  }

  // ── Incoming voice offer ────────────────────────────────────────────────
  const handleVoiceOffer = async (fromId, offer) => {
    const socket = getSocket()
    if (voicePeersRef.current[fromId]) voicePeersRef.current[fromId].close()

    const pc = makePeer(fromId, 'voice')
    voicePeersRef.current[fromId] = pc

    // If we are also broadcasting mic, add our stream
    if (localAudioRef.current) {
      localAudioRef.current.getTracks().forEach(t =>
        pc.addTrack(t, localAudioRef.current))
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL,
        { to: fromId, signal: candidate, type: 'ice-voice' })
    }
    pc.ontrack = ({ streams }) => {
      console.log('[RTC] got remote audio')
      if (streams[0]) playAudio(streams[0])
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: 'voice-answer' })
  }

  // ── Incoming screen / camera offer ─────────────────────────────────────
  const handleMediaOffer = async (fromId, fromName, offer, kind) => {
    const socket = getSocket()
    const peersRef = kind === 'screen' ? screenPeersRef : cameraPeersRef
    if (peersRef.current[fromId]) peersRef.current[fromId].close()

    const pc = makePeer(fromId, kind)
    peersRef.current[fromId] = pc

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL,
        { to: fromId, signal: candidate, type: `ice-${kind}` })
    }

    pc.ontrack = ({ streams }) => {
      console.log(`[RTC] got remote ${kind} track`, streams)
      if (!streams?.[0]) return
      setMediaStreams?.(prev => {
        const filtered = prev.filter(s => !(s.fromId === fromId && s.kind === kind))
        return [...filtered, {
          fromId,
          name: `${fromName || 'User'}'s ${kind}`,
          stream: streams[0],
          muted: kind !== 'camera',
          kind,
          mirror: kind === 'camera',
        }]
      })
      streams[0].getTracks().forEach(t => {
        t.onended = () =>
          setMediaStreams?.(prev => prev.filter(s => !(s.fromId === fromId && s.kind === kind)))
      })
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: `${kind}-answer` })
  }

  // ── Offer to every other user ───────────────────────────────────────────
  const offerToAll = async (stream, peersRef, kind) => {
    const socket = getSocket()
    const me = userRef.current
    const others = onlineUsersRef.current.filter(u => u.id !== me?.id)

    console.log(`[RTC] offering ${kind} to ${others.length} peers`, others.map(u => u.name))

    if (others.length === 0) {
      console.warn('[RTC] no other users in room — nobody to offer to')
      return
    }

    for (const other of others) {
      if (peersRef.current[other.id]) peersRef.current[other.id].close()

      const pc = makePeer(other.id, kind)
      peersRef.current[other.id] = pc

      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL,
          { to: other.id, signal: candidate, type: `ice-${kind}` })
      }

      if (kind === 'voice') {
        pc.ontrack = ({ streams }) => {
          if (streams?.[0]) playAudio(streams[0])
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket?.emit(EVENTS.WEBRTC_SIGNAL, {
        to: other.id,
        fromName: me?.name,
        signal: offer,
        type: `${kind}-offer`,
      })
      console.log(`[RTC] sent ${kind} offer to ${other.name}`)
    }
  }

  // ── Public: start / stop ────────────────────────────────────────────────
  const startVoiceChat = async () => {
    const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
    localAudioRef.current = stream
    setMicOn(true)
    await offerToAll(stream, voicePeers, 'voice')
  }

  const stopVoiceChat = () => {
    localAudioRef.current?.getTracks().forEach(t => t.stop())
    Object.values(voicePeers.current).forEach(pc => pc.close())
    voicePeers.current = {}
    localAudioRef.current = null
    setMicOn(false)
  }

  const startScreenShare = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true,
    })
    screenStreamRef.current = stream
    setScreenOn(true)
    stream.getVideoTracks()[0].onended = stopScreenShare

    setMediaStreams?.(prev => [
      ...prev.filter(s => s.kind !== 'screen-local'),
      { fromId: 'local', name: 'Your screen', stream, muted: true, kind: 'screen-local', mirror: false },
    ])
    await offerToAll(stream, screenPeers, 'screen')
  }

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(screenPeers.current).forEach(pc => pc.close())
    screenPeers.current = {}
    screenStreamRef.current = null
    setScreenOn(false)
    setMediaStreams?.(prev => prev.filter(s => !['screen','screen-local'].includes(s.kind)))
  }

  const startCameraShare = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
    cameraStreamRef.current = stream
    setCameraOn(true)

    setMediaStreams?.(prev => [
      ...prev.filter(s => s.kind !== 'camera-local'),
      { fromId: 'local-cam', name: 'Your camera', stream, muted: true, kind: 'camera-local', mirror: true },
    ])
    await offerToAll(stream, cameraPeers, 'camera')
  }

  const stopCameraShare = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(cameraPeers.current).forEach(pc => pc.close())
    cameraPeers.current = {}
    cameraStreamRef.current = null
    setCameraOn(false)
    setMediaStreams?.(prev => prev.filter(s => !['camera','camera-local'].includes(s.kind)))
  }

  useEffect(() => () => {
    stopVoiceChat(); stopScreenShare(); stopCameraShare()
    audioElements.current.forEach(a => a.pause())
    audioElements.current = []
  }, [])

  return {
    micOn, screenOn, cameraOn,
    startVoiceChat, stopVoiceChat,
    startScreenShare, stopScreenShare,
    startCameraShare, stopCameraShare,
  }
}

export default useWebRTC