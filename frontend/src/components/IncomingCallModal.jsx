import { useCall } from '../context/CallContext'
import { PhoneIcon, PhoneOffIcon, VideoIcon } from './CallIcons'

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

/**
 * Appel entrant. Monte au niveau de l'application (et non de la page
 * Messagerie) : l'utilisateur doit pouvoir decrocher depuis n'importe quel
 * ecran, y compris sa feuille de temps.
 */
export default function IncomingCallModal() {
  const { status, call, acceptCall, declineCall } = useCall()

  if (status !== 'incoming' || !call) return null
  const isVideo = call.type === 'VIDEO'

  return (
    <div className="incoming-call-backdrop" role="dialog" aria-label="Appel entrant">
      <div className="incoming-call-card">
        <div className="incoming-call-avatar">{initialsOf(call.peerName)}</div>
        <h3>{call.peerName}</h3>
        <p className="incoming-call-type">
          {isVideo ? <VideoIcon size="16px" /> : <PhoneIcon size="16px" />}
          <span>{isVideo ? 'Appel vidéo entrant' : 'Appel entrant'}</span>
        </p>

        <div className="incoming-call-actions">
          <button
            type="button"
            className="call-btn call-btn-hangup"
            onClick={declineCall}
            title="Refuser"
            aria-label="Refuser l'appel"
          >
            <PhoneOffIcon />
          </button>
          <button
            type="button"
            className="call-btn call-btn-accept"
            onClick={acceptCall}
            title="Répondre"
            aria-label="Répondre à l'appel"
          >
            {isVideo ? <VideoIcon /> : <PhoneIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
