import { useEffect, useRef, useState } from 'react'
import { useCall } from '../context/CallContext'
import {
  MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, PhoneOffIcon, ScreenShareIcon,
} from './CallIcons'

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CallWindow() {
  const {
    status, call, muted, cameraOff, sharingScreen, remoteMediaState, startedAt,
    localStreamRef, remoteStreamRef,
    endCall, toggleMute, toggleCamera, toggleScreenShare,
  } = useCall()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  const isVideo = call?.type === 'VIDEO'
  const visible = status === 'outgoing' || status === 'active'

  // Rattache les flux aux balises <video> : les MediaStream sont portes par des
  // refs (pas par l'etat React), il faut donc les poser manuellement.
  useEffect(() => {
    if (!visible) return
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current
    }
  }, [visible, status, remoteMediaState, sharingScreen, localStreamRef, remoteStreamRef])

  useEffect(() => {
    if (status !== 'active' || !startedAt) return setElapsed(0)
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [status, startedAt])

  if (!visible || !call) return null

  const remoteHidden = !isVideo || remoteMediaState.cameraOff || !remoteStreamRef.current

  return (
    <div className="call-overlay" role="dialog" aria-label="Appel en cours">
      <div className="call-stage">
        {/* Flux distant : plein cadre en video, pastille d'initiales sinon */}
        <video
          ref={remoteVideoRef}
          className="call-remote-video"
          autoPlay
          playsInline
          style={{ display: remoteHidden ? 'none' : 'block' }}
        />
        {remoteHidden && (
          <div className="call-avatar-stage">
            <div className="call-avatar-large">{initialsOf(call.peerName)}</div>
            <h2>{call.peerName}</h2>
            <p className="call-status-text">
              {status === 'outgoing'
                ? 'Sonnerie…'
                : remoteMediaState.cameraOff
                  ? 'Caméra désactivée'
                  : formatDuration(elapsed)}
            </p>
          </div>
        )}

        {/* Bandeau d'information, visible aussi en plein ecran video */}
        {!remoteHidden && (
          <div className="call-topbar">
            <span className="call-peer-name">{call.peerName}</span>
            <span className="call-timer">
              {status === 'outgoing' ? 'Sonnerie…' : formatDuration(elapsed)}
            </span>
          </div>
        )}

        {remoteMediaState.muted && (
          <div className="call-remote-muted">Micro coupé</div>
        )}

        {/* Incrustation du flux local */}
        {isVideo && (
          <div className={`call-local-pip ${cameraOff ? 'is-off' : ''}`}>
            {cameraOff ? (
              <div className="call-pip-off"><VideoOffIcon size="20px" /></div>
            ) : (
              <video ref={localVideoRef} autoPlay playsInline muted />
            )}
          </div>
        )}
      </div>

      <div className="call-controls">
        <button
          type="button"
          className={`call-btn ${muted ? 'is-active' : ''}`}
          onClick={toggleMute}
          title={muted ? 'Réactiver le micro' : 'Couper le micro'}
          aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>

        {isVideo && (
          <button
            type="button"
            className={`call-btn ${cameraOff ? 'is-active' : ''}`}
            onClick={toggleCamera}
            title={cameraOff ? 'Activer la caméra' : 'Désactiver la caméra'}
            aria-label={cameraOff ? 'Activer la caméra' : 'Désactiver la caméra'}
          >
            {cameraOff ? <VideoOffIcon /> : <VideoIcon />}
          </button>
        )}

        {isVideo && (
          <button
            type="button"
            className={`call-btn ${sharingScreen ? 'is-active' : ''}`}
            onClick={toggleScreenShare}
            title={sharingScreen ? "Arrêter le partage d'écran" : "Partager l'écran"}
            aria-label={sharingScreen ? "Arrêter le partage d'écran" : "Partager l'écran"}
          >
            <ScreenShareIcon />
          </button>
        )}

        <button
          type="button"
          className="call-btn call-btn-hangup"
          onClick={endCall}
          title="Raccrocher"
          aria-label="Raccrocher"
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  )
}
