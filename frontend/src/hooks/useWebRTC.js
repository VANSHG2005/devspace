import { useRef, useState, useCallback, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { getSocket, EVENTS } from '../utils/socket'

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free TURN servers — required for connections through firewalls/NAT
    // (STUN alone fails ~30% of the time on real networks)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
}

// High-quality audio constraints: eliminate echo, noise, and distortion
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,      // Removes echo from speakers
    noiseSuppression: true,      // Removes background noise
    autoGainControl: true,       // Normalizes volume levels
    sampleRate: 48000,           // High quality sample rate
    channelCount: 1,             // Mono for voice (more efficient)
    latency: 0,                  // Minimize latency
  },
  video: false,
}

export const useWebRTC = (workspaceId, setMediaStreams) => {
  const { user } = useSelector(s => s.auth)
  const { onlineUsers } = useSelector(s => s.workspace)
  const [micOn, setMicOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)

  const localAudioRef = useRef(null)
  const screenStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const voicePeers = useRef({})
  const screenPeers = useRef({})
  const cameraPeers = useRef({})

  // Keep audio elements to avoid GC
  const audioElements = useRef([])

  // ── Signal handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onSignal = async ({ from, fromName, signal, type }) => {
      if (from === user?.id) return
      if      (type === 'voice-offer')   handleVoiceOffer(from, signal)
      else if (type === 'voice-answer')  setRemoteDesc(voicePeers.current[from], signal)
      else if (type === 'screen-offer')  handleMediaOffer(from, fromName, signal, 'screen')
      else if (type === 'screen-answer') setRemoteDesc(screenPeers.current[from], signal)
      else if (type === 'camera-offer')  handleMediaOffer(from, fromName, signal, 'camera')
      else if (type === 'camera-answer') setRemoteDesc(cameraPeers.current[from], signal)
      else if (type === 'ice-voice')  addIce(voicePeers.current[from], signal)
      else if (type === 'ice-screen') addIce(screenPeers.current[from], signal)
      else if (type === 'ice-camera') addIce(cameraPeers.current[from], signal)
    }
    socket.on(EVENTS.WEBRTC_SIGNAL, onSignal)
    return () => socket.off(EVENTS.WEBRTC_SIGNAL, onSignal)
  }, [user?.id])

  const setRemoteDesc = async (pc, signal) => {
    if (!pc) return
    try { await pc.setRemoteDescription(new RTCSessionDescription(signal)) } catch {}
  }

  const addIce = async (pc, signal) => {
    if (!pc) return
    try { await pc.addIceCandidate(new RTCIceCandidate(signal)) } catch {}
  }

  // ── Play audio via persistent element (avoids GC cutting it off) ─────────
  const playAudio = (stream) => {
    const audio = new Audio()
    audio.srcObject = stream
    audio.autoplay = true
    // Explicitly set to null (not muted) and set volume
    audio.muted = false
    audio.volume = 1.0
    audio.play().catch(() => {})
    // Keep reference so it doesn't get garbage collected
    audioElements.current.push(audio)
    // Clean up when track ends
    stream.getTracks().forEach(t => {
      t.onended = () => {
        audio.pause()
        audioElements.current = audioElements.current.filter(a => a !== audio)
      }
    })
    return audio
  }

  // ── Incoming voice offer ──────────────────────────────────────────────────
  const handleVoiceOffer = useCallback(async (fromId, offer) => {
    const socket = getSocket()

    if (voicePeers.current[fromId]) {
      try { voicePeers.current[fromId].close() } catch {}
    }

    const pc = new RTCPeerConnection(ICE)
    voicePeers.current[fromId] = pc
    console.log('[WebRTC] incoming voice offer from', fromId)

    if (localAudioRef.current) {
      localAudioRef.current.getTracks().forEach(t => pc.addTrack(t, localAudioRef.current))
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: candidate, type: 'ice-voice' })
    }

    pc.ontrack = ({ streams }) => {
      playAudio(streams[0])
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: 'voice-answer' })
  }, [])

  // ── Incoming screen/camera offer ──────────────────────────────────────────
  const handleMediaOffer = useCallback(async (fromId, fromName, offer, kind) => {
    const socket = getSocket()
    const peersRef = kind === 'screen' ? screenPeers : cameraPeers

    if (peersRef.current[fromId]) {
      try { peersRef.current[fromId].close() } catch {}
    }

    const pc = new RTCPeerConnection(ICE)
    peersRef.current[fromId] = pc

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: candidate, type: `ice-${kind}` })
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] incoming ${kind} from ${fromName}: ${pc.connectionState}`)
    }

    pc.ontrack = ({ streams }) => {
      console.log(`[WebRTC] received ${kind} track from ${fromName}`, streams[0])
      if (setMediaStreams) {
        // Camera streams need mirror=true (front cameras capture mirrored data)
        // Screen share streams should NOT be mirrored
        const needsMirror = kind === 'camera'
        setMediaStreams(prev => {
          const next = prev.filter(s => !(s.fromId === fromId && s.kind === kind))
          return [...next, {
            fromId,
            name: `${fromName}'s ${kind}`,
            stream: streams[0],
            muted: kind !== 'camera',
            kind,
            mirror: needsMirror,
          }]
        })
        streams[0].getTracks().forEach(t => {
          t.onended = () => setMediaStreams(prev => prev.filter(s => !(s.fromId === fromId && s.kind === kind)))
        })
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: fromId, signal: answer, type: `${kind}-answer` })
  }, [setMediaStreams])

  // ── Offer to all peers ────────────────────────────────────────────────────
  const offerToAll = async (stream, peersRef, kind) => {
    const socket = getSocket()
    const others = (onlineUsers || []).filter(u => u.id !== user?.id)

    for (const other of others) {
      // Close any existing connection for this peer+kind
      if (peersRef.current[other.id]) {
        try { peersRef.current[other.id].close() } catch {}
      }

      const pc = new RTCPeerConnection(ICE)
      peersRef.current[other.id] = pc

      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket?.emit(EVENTS.WEBRTC_SIGNAL, { to: other.id, signal: candidate, type: `ice-${kind}` })
      }

      // Log connection state for debugging
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] ${kind} → ${other.id}: ${pc.connectionState}`)
        if (pc.connectionState === 'failed') {
          console.warn('[WebRTC] Connection failed — try restarting ICE')
          try { pc.restartIce() } catch {}
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE ${kind} → ${other.id}: ${pc.iceConnectionState}`)
      }

      if (kind === 'voice') {
        pc.ontrack = ({ streams }) => {
          console.log('[WebRTC] Received remote audio track')
          playAudio(streams[0])
        }
      }

      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket?.emit(EVENTS.WEBRTC_SIGNAL, {
          to: other.id,
          signal: offer,
          fromName: user?.name,
          type: `${kind}-offer`,
        })
      } catch (err) {
        console.error('[WebRTC] offer failed:', err)
      }
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  const startVoiceChat = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
      localAudioRef.current = stream
      setMicOn(true)
      await offerToAll(stream, voicePeers, 'voice')
    } catch (err) {
      console.error('Mic error:', err)
      throw err
    }
  }, [onlineUsers, user])

  const stopVoiceChat = useCallback(() => {
    localAudioRef.current?.getTracks().forEach(t => t.stop())
    Object.values(voicePeers.current).forEach(pc => pc.close())
    voicePeers.current = {}
    localAudioRef.current = null
    setMicOn(false)
  }, [])

  // ── Screen share ──────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true,  // capture tab/system audio if permitted
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
  }, [onlineUsers, user])

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(screenPeers.current).forEach(pc => pc.close())
    screenPeers.current = {}
    screenStreamRef.current = null
    setScreenOn(false)
    if (setMediaStreams) setMediaStreams(prev => prev.filter(s => s.kind !== 'screen' && s.kind !== 'screen-local'))
  }, [setMediaStreams])

  // ── Camera share ──────────────────────────────────────────────────────────
  const startCameraShare = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
      audio: false,
    })
    cameraStreamRef.current = stream
    setCameraOn(true)

    // Local preview mirrors itself (natural selfie-camera feel)
    if (setMediaStreams) {
      setMediaStreams(prev => [
        ...prev.filter(s => s.kind !== 'camera-local'),
        { fromId: 'local-cam', name: 'Your camera', stream, muted: true, kind: 'camera-local', mirror: true },
      ])
    }
    await offerToAll(stream, cameraPeers, 'camera')
  }, [onlineUsers, user])

  const stopCameraShare = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    Object.values(cameraPeers.current).forEach(pc => pc.close())
    cameraPeers.current = {}
    cameraStreamRef.current = null
    setCameraOn(false)
    if (setMediaStreams) setMediaStreams(prev => prev.filter(s => s.kind !== 'camera' && s.kind !== 'camera-local'))
  }, [setMediaStreams])

  // Cleanup on unmount
  useEffect(() => () => {
    stopVoiceChat()
    stopScreenShare()
    stopCameraShare()
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
// WebRTC: echo cancellation, noise suppression, camera mirror fix
