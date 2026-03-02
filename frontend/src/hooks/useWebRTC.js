import { useRef, useState, useCallback, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { getSocket, EVENTS } from '../utils/socket'

// Use Metered TURN servers (free tier, reliable)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
}

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
  },
  video: false,
}

export const useWebRTC = (workspaceId, setMediaStreams) => {
  const { user } = useSelector(s => s.auth)
  const { onlineUsers } = useSelector(s => s.workspace)

  const [micOn, setMicOn]       = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)

  const localAudioRef  = useRef(null)
  const screenStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)

  // peer maps: { [userId]: RTCPeerConnection }
  const voicePeers  = useRef({})
  const screenPeers = useRef({})
  const cameraPeers = useRef({})

  // Keep audio elements alive (prevent GC)
  const audioElements = useRef([])

  // ── Play remote audio ─────────────────────────────────────────────────────
  const playAudio = useCallback((stream) => {
    const audio = new Audio()
    audio.srcObject = stream
    audio.autoplay  = true
    audio.muted     = false
    audio.volume    = 1.0
    audio.play().catch(err => console.warn('[WebRTC] audio play blocked:', err))
    audioElements.current.push(audio)
    stream.getTracks().forEach(t => {
      t.onended = () => {
        audio.pause()
        audioElements.current = audioElements.current.filter(a => a !== audio)
      }
    })
  }, [])

  // ── Create a peer connection with logging ─────────────────────────────────
  const createPC = useCallback((peerId, kind) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${kind} peer ${peerId}: ${pc.connectionState}`)
      if (pc.connectionState === 'failed') {
        console.warn('[WebRTC] connection failed — restarting ICE')
        try { pc.restartIce() } catch {}
      }
    }
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE ${kind} peer ${peerId}: ${pc.iceConnectionState}`)
    }
    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering ${kind}: ${pc.iceGatheringState}`)
    }
    return pc
  }, [])

  // ── Signal handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const onSignal = async ({ from, fromName, signal, type }) => {
      if (!from || from === user?.id) return
      console.log('[WebRTC] received signal:', type, 'from', from)

      try {
        if (type === 'voice-offer')   await handleVoiceOffer(from, signal)
        else if (type === 'voice-answer')  await setRemoteDesc(voicePeers.current[from], signal)
        else if (type === 'screen-offer')  await handleMediaOffer(from, fromName, signal, 'screen')
        else if (type === 'screen-answer') await setRemoteDesc(screenPeers.current[from], signal)
        else if (type === 'camera-offer')  await handleMediaOffer(from, fromName, signal, 'camera')
        else if (type === 'camera-answer') await setRemoteDesc(cameraPeers.current[from], signal)
        else if (type === 'ice-voice')  await addIce(voicePeers.current[from], signal)
        else if (type === 'ice-screen') await addIce(screenPeers.current[from], signal)
        else if (type === 'ice-camera') await addIce(cameraPeers.current[from], signal)
      } catch (err) {
        console.error('[WebRTC] signal handling error:', err)
      }
    }

    socket.on(EVENTS.WEBRTC_SIGNAL, onSignal)
    return () => socket.off(EVENTS.WEBRTC_SIGNAL, onSignal)
  }, [user?.id])  // NOTE: handlers below use useRef so no deps needed

  const setRemoteDesc = async (pc, signal) => {
    if (!pc || pc.signalingState === 'closed') return
    try { await pc.setRemoteDescription(new RTCSessionDescription(signal)) }
    catch (e) { console.warn('[WebRTC] setRemoteDesc error:', e.message) }
  }

  const addIce = async (pc, signal) => {
    if (!pc || pc.signalingState === 'closed') return
    try { await pc.addIceCandidate(new RTCIceCandidate(signal)) }
    catch (e) { console.warn('[WebRTC] addIce error:', e.message) }
  }

  // ── Incoming voice offer ──────────────────────────────────────────────────
  const handleVoiceOffer = async (fromId, offer) => {
    const socket = getSocket()
    console.log('[WebRTC] handling voice offer from', fromId)

    if (voicePeers.current[fromId]) {
      try { voicePeers.current[fromId].close() } catch {}
    }

    const pc = createPC(fromId, 'voice')
    voicePeers.current[fromId] = pc

    // Add our local audio if mic is on
    if (localAudioRef.current) {
      localAudioRef.current.getTracks().forEach(t => pc.addTrack(t, localAudioRef.current))
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: candidate, type: 'ice-voice' })
    }
    pc.ontrack = ({ streams }) => {
      console.log('[WebRTC] received remote audio track')
      if (streams[0]) playAudio(streams[0])
    }

    await setRemoteDesc(pc, offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: 'voice-answer' })
  }

  // ── Incoming screen/camera offer ──────────────────────────────────────────
  const handleMediaOffer = async (fromId, fromName, offer, kind) => {
    const socket = getSocket()
    const peersRef = kind === 'screen' ? screenPeers : cameraPeers
    console.log(`[WebRTC] handling ${kind} offer from`, fromId)

    if (peersRef.current[fromId]) {
      try { peersRef.current[fromId].close() } catch {}
    }

    const pc = createPC(fromId, kind)
    peersRef.current[fromId] = pc

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: candidate, type: `ice-${kind}` })
    }

    pc.ontrack = ({ streams }) => {
      console.log(`[WebRTC] received ${kind} track from`, fromName, streams[0])
      if (!streams[0]) return
      if (setMediaStreams) {
        setMediaStreams(prev => {
          const next = prev.filter(s => !(s.fromId === fromId && s.kind === kind))
          return [...next, {
            fromId, name: `${fromName}'s ${kind}`,
            stream: streams[0], muted: kind !== 'camera',
            kind, mirror: kind === 'camera',
          }]
        })
        streams[0].getTracks().forEach(t => {
          t.onended = () => setMediaStreams(prev => prev.filter(s => !(s.fromId === fromId && s.kind === kind)))
        })
      }
    }

    await setRemoteDesc(pc, offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: `${kind}-answer` })
  }

  // ── Offer to all online peers ─────────────────────────────────────────────
  const offerToAll = useCallback(async (stream, peersRef, kind) => {
    const socket = getSocket()
    if (!socket) { console.warn('[WebRTC] no socket'); return }

    const others = (onlineUsers || []).filter(u => u.id !== user?.id)
    console.log(`[WebRTC] offering ${kind} to`, others.length, 'peers')

    for (const other of others) {
      if (peersRef.current[other.id]) {
        try { peersRef.current[other.id].close() } catch {}
      }

      const pc = createPC(other.id, kind)
      peersRef.current[other.id] = pc

      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit(EVENTS.WEBRTC_SIGNAL, { to: other.id, signal: candidate, type: `ice-${kind}` })
        }
      }

      if (kind === 'voice') {
        pc.ontrack = ({ streams }) => {
          if (streams[0]) playAudio(streams[0])
        }
      }

      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit(EVENTS.WEBRTC_SIGNAL, {
          to: other.id,
          fromName: user?.name,
          signal: offer,
          type: `${kind}-offer`,
        })
        console.log(`[WebRTC] sent ${kind} offer to`, other.id)
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err)
      }
    }
  }, [onlineUsers, user, createPC, playAudio])

  // ── Voice ─────────────────────────────────────────────────────────────────
  const startVoiceChat = useCallback(async () => {
    console.log('[WebRTC] starting voice...')
    const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
    localAudioRef.current = stream
    setMicOn(true)
    await offerToAll(stream, voicePeers, 'voice')
  }, [offerToAll])

  const stopVoiceChat = useCallback(() => {
    localAudioRef.current?.getTracks().forEach(t => t.stop())
    Object.values(voicePeers.current).forEach(pc => { try { pc.close() } catch {} })
    voicePeers.current = {}
    localAudioRef.current = null
    setMicOn(false)
  }, [])

  // ── Screen share ──────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true,
    })
    screenStreamRef.current = stream
    setScreenOn(true)
    stream.getVideoTracks()[0].onended = () => stopScreenShare()

    if (setMediaStreams) {
      setMediaStreams(prev => [
        ...prev.filter(s => s.kind !== 'screen-local'),
        { fromId: 'local', name: 'Your screen', stream, muted: true, kind: 'screen-local', mirror: false },
      ])
    }
    await offerToAll(stream, screenPeers, 'screen')
  }, [offerToAll, setMediaStreams])

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(screenPeers.current).forEach(pc => { try { pc.close() } catch {} })
    screenPeers.current = {}
    screenStreamRef.current = null
    setScreenOn(false)
    if (setMediaStreams) setMediaStreams(prev => prev.filter(s => !['screen','screen-local'].includes(s.kind)))
  }, [setMediaStreams])

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCameraShare = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false,
    })
    cameraStreamRef.current = stream
    setCameraOn(true)

    if (setMediaStreams) {
      setMediaStreams(prev => [
        ...prev.filter(s => s.kind !== 'camera-local'),
        { fromId: 'local-cam', name: 'Your camera', stream, muted: true, kind: 'camera-local', mirror: true },
      ])
    }
    await offerToAll(stream, cameraPeers, 'camera')
  }, [offerToAll, setMediaStreams])

  const stopCameraShare = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(cameraPeers.current).forEach(pc => { try { pc.close() } catch {} })
    cameraPeers.current = {}
    cameraStreamRef.current = null
    setCameraOn(false)
    if (setMediaStreams) setMediaStreams(prev => prev.filter(s => !['camera','camera-local'].includes(s.kind)))
  }, [setMediaStreams])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopVoiceChat()
    stopScreenShare()
    stopCameraShare()
    audioElements.current.forEach(a => { try { a.pause() } catch {} })
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
