import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { useChat } from './ChatContext'
import { useToast } from './ToastContext'
import API_URL from '../config/api'

/**
 * Appels audio et video en pair a pair (WebRTC).
 *
 * Repartition des roles :
 *  - ce contexte gere la RTCPeerConnection, les flux locaux et distants ;
 *  - le socket du ChatContext sert uniquement de canal de signalisation
 *    (echange des SDP et des candidats ICE) ;
 *  - le flux audio/video ne passe jamais par le serveur : il va directement
 *    d'un navigateur a l'autre, ou via TURN quand le pair a pair est bloque.
 */
const CallContext = createContext(null)

const IDLE = 'idle'
const OUTGOING = 'outgoing'   // on appelle, ca sonne en face
const INCOMING = 'incoming'   // on est appele
const ACTIVE = 'active'       // les deux flux sont etablis

export function CallProvider({ children }) {
  const { token, user } = useAuth()
  const { socket, isConnected } = useChat()
  const { showToast } = useToast()

  const [status, setStatus] = useState(IDLE)
  const [call, setCall] = useState(null)          // { callId, channelId, type, peerId, peerName }
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const [remoteMediaState, setRemoteMediaState] = useState({ muted: false, cameraOff: false })
  const [startedAt, setStartedAt] = useState(null)
  const statusRef = useRef(status)

  /**
   * Raison pour laquelle les appels sont indisponibles, ou null s'ils le sont.
   *
   * Les navigateurs reservent l'acces au micro et a la camera aux origines
   * sures : en HTTP simple (hors localhost) `navigator.mediaDevices` n'existe
   * meme pas. On expose le motif plutot qu'un simple booleen, afin que
   * l'interface puisse l'afficher au lieu de masquer la fonction sans un mot.
   */
  const callUnavailableReason = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (!window.isSecureContext) {
      return 'Les appels nécessitent une connexion sécurisée (HTTPS).'
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'Ce navigateur ne prend pas en charge les appels audio et vidéo.'
    }
    return null
  }, [])

  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const cameraTrackRef = useRef(null)             // piste camera mise de cote pendant un partage d'ecran
  const remoteStreamRef = useRef(null)
  const callRef = useRef(null)                    // miroir de `call` lisible dans les handlers socket
  const pendingCandidatesRef = useRef([])         // candidats recus avant la description distante
  const ringtoneRef = useRef(null)

  useEffect(() => { callRef.current = call }, [call])
  useEffect(() => { statusRef.current = status }, [status])

  // --------------------------------------------------------------- sonnerie
  const stopRingtone = useCallback(() => {
    const audio = ringtoneRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  const startRingtone = useCallback(() => {
    // Bip synthetise via l'API Web Audio : evite d'embarquer un fichier son.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const gain = ctx.createGain()
      gain.gain.value = 0.05
      gain.connect(ctx.destination)
      const beep = () => {
        const osc = ctx.createOscillator()
        osc.frequency.value = 480
        osc.connect(gain)
        osc.start()
        osc.stop(ctx.currentTime + 0.35)
      }
      beep()
      const interval = setInterval(beep, 1600)
      ringtoneRef.current = {
        pause: () => { clearInterval(interval); ctx.close().catch(() => {}) },
        currentTime: 0,
      }
    } catch {
      // Le navigateur peut refuser l'audio avant toute interaction : sans gravite.
    }
  }, [])

  // ------------------------------------------------------------- nettoyage
  const cleanup = useCallback(() => {
    stopRingtone()
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.onconnectionstatechange = null
      try { pcRef.current.close() } catch { /* deja fermee */ }
      pcRef.current = null
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraTrackRef.current?.stop?.()
    localStreamRef.current = null
    cameraTrackRef.current = null
    remoteStreamRef.current = null
    pendingCandidatesRef.current = []
    setStatus(IDLE)
    setCall(null)
    setMuted(false)
    setCameraOff(false)
    setSharingScreen(false)
    setRemoteMediaState({ muted: false, cameraOff: false })
    setStartedAt(null)
  }, [stopRingtone])

  // ------------------------------------------------------------ raccrochage
  const endCall = useCallback(() => {
    const current = callRef.current
    if (current?.callId) socket?.emit('call:end', { callId: current.callId })
    cleanup()
  }, [socket, cleanup])

  // ------------------------------------------------- configuration ICE + PC
  const fetchIceServers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/chat/ice-servers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('ice-servers indisponible')
      const data = await response.json()
      return data.iceServers ?? []
    } catch {
      // Repli STUN public : suffisant hors NAT symetrique.
      return [{ urls: ['stun:stun.l.google.com:19302'] }]
    }
  }, [token])

  const createPeerConnection = useCallback(async (callId, peerId) => {
    const iceServers = await fetchIceServers()
    const pc = new RTCPeerConnection({ iceServers })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('call:ice-candidate', { callId, to: peerId, candidate: event.candidate })
      }
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams
      remoteStreamRef.current = stream ?? null
      // Force un rendu pour que CallWindow rattache le flux a la balise video.
      setRemoteMediaState((prev) => ({ ...prev }))
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        showToast("La connexion a échoué. Un serveur TURN est probablement nécessaire.", 'error')
        endCall()
      }
    }

    pcRef.current = pc
    return pc
  }, [fetchIceServers, socket, showToast, endCall])

  const getLocalStream = useCallback(async (withVideo) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    })
    localStreamRef.current = stream
    return stream
  }, [])

  // ------------------------------------------------------------ appel sortant
  const startCall = useCallback(async (channel, type = 'AUDIO') => {
    if (callUnavailableReason) return showToast(callUnavailableReason, 'error')
    if (!socket || !isConnected) return showToast('Service de messagerie indisponible.', 'error')
    if (status !== IDLE) return showToast('Un appel est déjà en cours.', 'error')
    if (channel?.type !== 'DIRECT') {
      return showToast('Les appels de groupe ne sont pas encore disponibles.', 'error')
    }

    const channelId = channel.channelId ?? channel.id
    const peerId = channel.userId
    const wantsVideo = type === 'VIDEO'

    try {
      // Les medias sont demandes avant l'invitation : si l'utilisateur refuse
      // l'acces au micro, inutile de faire sonner le correspondant.
      const stream = await getLocalStream(wantsVideo)

      socket.emit('call:invite', { channelId, type }, async (response) => {
        if (!response?.ok) {
          stream.getTracks().forEach((t) => t.stop())
          localStreamRef.current = null
          return showToast(response?.message ?? "Impossible d'ouvrir l'appel", 'error')
        }

        const pc = await createPeerConnection(response.callId, peerId)
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        if (wantsVideo) cameraTrackRef.current = stream.getVideoTracks()[0] ?? null

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('call:offer', { callId: response.callId, to: peerId, sdp: offer })

        setCall({
          callId: response.callId,
          channelId,
          type,
          peerId,
          peerName: channel.name ?? 'Correspondant',
        })
        setStatus(OUTGOING)
        startRingtone()
      })
    } catch (error) {
      showToast(
        error?.name === 'NotAllowedError'
          ? "Accès au micro ou à la caméra refusé."
          : "Micro ou caméra indisponible.",
        'error',
      )
    }
  }, [socket, isConnected, status, showToast, getLocalStream, createPeerConnection, startRingtone,
      callUnavailableReason])

  // ------------------------------------------------------------ appel entrant
  const acceptCall = useCallback(async () => {
    const current = callRef.current
    if (!current || !socket) return
    stopRingtone()

    try {
      const wantsVideo = current.type === 'VIDEO'
      const stream = await getLocalStream(wantsVideo)
      const pc = pcRef.current ?? (await createPeerConnection(current.callId, current.peerId))
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      if (wantsVideo) cameraTrackRef.current = stream.getVideoTracks()[0] ?? null

      // L'offre distante est deja posee par le handler `call:offer`.
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('call:accept', { callId: current.callId })
      socket.emit('call:answer', { callId: current.callId, to: current.peerId, sdp: answer })

      setStatus(ACTIVE)
      setStartedAt(Date.now())
    } catch (error) {
      showToast(
        error?.name === 'NotAllowedError'
          ? "Accès au micro ou à la caméra refusé."
          : "Impossible de prendre l'appel.",
        'error',
      )
      socket.emit('call:decline', { callId: current.callId })
      cleanup()
    }
  }, [socket, getLocalStream, createPeerConnection, stopRingtone, showToast, cleanup])

  const declineCall = useCallback(() => {
    const current = callRef.current
    if (current?.callId) socket?.emit('call:decline', { callId: current.callId })
    cleanup()
  }, [socket, cleanup])

  // --------------------------------------------------------------- controles
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const next = !track.enabled
    setMuted(next)
    const current = callRef.current
    if (current?.callId) socket?.emit('call:media-state', { callId: current.callId, muted: next })
  }, [socket])

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const next = !track.enabled
    setCameraOff(next)
    const current = callRef.current
    if (current?.callId) socket?.emit('call:media-state', { callId: current.callId, cameraOff: next })
  }, [socket])

  /** Bascule camera <-> ecran en remplacant la piste sortante, sans renegocier. */
  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
    if (!sender) return showToast("Le partage d'écran nécessite un appel vidéo.", 'error')

    // Remet la camera et libere la piste d'ecran.
    const restoreCamera = async (screenTrack) => {
      const camera = cameraTrackRef.current
      if (camera) await sender.replaceTrack(camera).catch(() => {})
      screenTrack?.stop?.()
      setSharingScreen(false)
    }

    if (sharingScreen) {
      await restoreCamera(sender.track)
      return
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = display.getVideoTracks()[0]
      cameraTrackRef.current = sender.track
      await sender.replaceTrack(screenTrack)
      // Le partage peut aussi etre stoppe depuis le bandeau du navigateur.
      screenTrack.onended = () => { void restoreCamera(screenTrack) }
      setSharingScreen(true)
    } catch {
      setSharingScreen(false)
    }
  }, [sharingScreen, showToast])

  // ------------------------------------------------- abonnements signalisation
  useEffect(() => {
    if (!socket) return

    const onIncoming = async (payload) => {
      // Un seul appel a la fois : on refuse poliment le second.
      if (callRef.current) {
        socket.emit('call:decline', { callId: payload.callId })
        return
      }
      setCall({
        callId: payload.callId,
        channelId: payload.channelId,
        type: payload.type,
        peerId: payload.from,
        peerName: payload.fromName ?? 'Appel entrant',
      })
      setStatus(INCOMING)
      startRingtone()
    }

    const onOffer = async (payload) => {
      const pc = pcRef.current ?? (await createPeerConnection(payload.callId, payload.from))
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      }
      pendingCandidatesRef.current = []
    }

    const onAnswer = async (payload) => {
      const pc = pcRef.current
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      stopRingtone()
      setStatus(ACTIVE)
      setStartedAt(Date.now())
    }

    const onCandidate = async (payload) => {
      const pc = pcRef.current
      // Un candidat peut arriver avant la description distante : on le met de
      // cote, sinon addIceCandidate leve une erreur et la connexion echoue.
      if (!pc?.remoteDescription) {
        pendingCandidatesRef.current.push(payload.candidate)
        return
      }
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {})
    }

    const onAccepted = () => { stopRingtone() }

    const onEnded = (payload) => {
      stopRingtone()
      const wasRinging = statusRef.current === OUTGOING || statusRef.current === INCOMING
      if (payload?.status === 'DECLINED') showToast('Appel refusé.', 'info')
      else if (payload?.status === 'MISSED' && wasRinging) showToast('Appel manqué.', 'info')
      cleanup()
    }

    const onRemoteMediaState = (payload) => {
      setRemoteMediaState((prev) => ({
        muted: typeof payload.muted === 'boolean' ? payload.muted : prev.muted,
        cameraOff: typeof payload.cameraOff === 'boolean' ? payload.cameraOff : prev.cameraOff,
      }))
    }

    socket.on('call:incoming', onIncoming)
    socket.on('call:offer', onOffer)
    socket.on('call:answer', onAnswer)
    socket.on('call:ice-candidate', onCandidate)
    socket.on('call:accepted', onAccepted)
    socket.on('call:ended', onEnded)
    socket.on('call:media-state', onRemoteMediaState)

    return () => {
      socket.off('call:incoming', onIncoming)
      socket.off('call:offer', onOffer)
      socket.off('call:answer', onAnswer)
      socket.off('call:ice-candidate', onCandidate)
      socket.off('call:accepted', onAccepted)
      socket.off('call:ended', onEnded)
      socket.off('call:media-state', onRemoteMediaState)
    }
  }, [socket, createPeerConnection, cleanup, stopRingtone, startRingtone, showToast])

  // Raccroche proprement si l'utilisateur ferme l'onglet en pleine conversation.
  useEffect(() => {
    const handler = () => { if (callRef.current) endCall() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [endCall])

  useEffect(() => () => cleanup(), [cleanup])

  const value = useMemo(() => ({
    status, call, muted, cameraOff, sharingScreen, remoteMediaState, startedAt,
    // Les flux sont exposes par leurs refs : lire `.current` ici renverrait une
    // valeur perimee, le MediaStream changeant hors cycle de rendu.
    localStreamRef, remoteStreamRef,
    startCall, acceptCall, declineCall, endCall,
    toggleMute, toggleCamera, toggleScreenShare,
    isCallSupported: !callUnavailableReason,
    callUnavailableReason,
    currentUserId: user?.id,
  }), [
    status, call, muted, cameraOff, sharingScreen, remoteMediaState, startedAt,
    startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, toggleScreenShare, user?.id,
    callUnavailableReason,
  ])

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export function useCall() {
  const context = useContext(CallContext)
  if (!context) throw new Error('useCall must be used within a CallProvider')
  return context
}
