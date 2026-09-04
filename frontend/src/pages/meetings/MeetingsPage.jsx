import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useCall } from '../../context/CallContext'
import { useToast } from '../../context/ToastContext'
import { createChatGroup } from '../messages/messagesApi'
import {
  attachMeetingChannel,
  cancelMeeting,
  createMeeting,
  fetchAvailability,
  fetchMyMeetings,
  respondToMeeting,
} from './meetingsApi'
import AvailabilityTimeline from './AvailabilityTimeline'
import { PhoneIcon, VideoIcon } from '../../components/CallIcons'
import CalendarIcon from '../../components/CalendarIcon'
import './MeetingsPage.css'

const RESPONSE_LABEL = {
  PENDING: 'En attente',
  ACCEPTED: 'Accepté',
  DECLINED: 'Refusé',
  TENTATIVE: 'Peut-être',
}

/** Valeur pour <input type="datetime-local">, qui attend l'heure locale. */
const toLocalInput = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

const formatRange = (startsAt, endsAt) => {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const day = start.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const hm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${hm(start)} – ${hm(end)}`
}

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

export default function MeetingsPage() {
  const { token, user } = useAuth()
  const { channels, setActiveChannelId, refreshChannels } = useChat()
  const { startCall, callUnavailableReason } = useCall()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [availability, setAvailability] = useState([])
  const [availLoading, setAvailLoading] = useState(false)

  // Memoise : `?? []` produirait un tableau neuf a chaque rendu, ce qui
  // invaliderait les callbacks qui en dependent.
  const colleagues = useMemo(() => channels.colleagues ?? [], [channels.colleagues])

  const emptyForm = useMemo(() => {
    // Créneau proposé par défaut : la prochaine heure ronde, une heure durant.
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 60 * 60_000)
    return {
      title: '',
      description: '',
      startsAt: toLocalInput(start),
      endsAt: toLocalInput(end),
      participantIds: [],
    }
  }, [])
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setMeetings(await fetchMyMeetings(token))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const nameOf = useCallback(
    (userId) => {
      if (userId === user?.id) return 'Vous'
      return colleagues.find((c) => c.userId === userId)?.name ?? 'Collaborateur'
    },
    [colleagues, user?.id],
  )

  // Rafraichi chaque minute : une reunion doit basculer d'elle-meme de
  // « a venir » vers « passees » sans rechargement.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const { upcoming, past } = useMemo(() => {
    const up = [], done = []
    for (const meeting of meetings) {
      ;(new Date(meeting.endsAt).getTime() >= now ? up : done).push(meeting)
    }
    // Les réunions passées se lisent de la plus récente à la plus ancienne.
    done.reverse()
    return { upcoming: up, past: done }
  }, [meetings, now])

  // ---------------------------------------------------- disponibilites

  /** Participants affichés dans la frise : les invités plus l'organisateur. */
  const timelineParticipants = useMemo(() => {
    const list = form.participantIds
      .map((id) => colleagues.find((c) => c.userId === id))
      .filter(Boolean)
      .map((c) => ({ userId: c.userId, name: c.name }))
    return [{ userId: user?.id, name: 'Vous' }, ...list].filter((p) => p.userId)
  }, [form.participantIds, colleagues, user?.id])

  const slotDates = useMemo(() => {
    const start = new Date(form.startsAt)
    const end = new Date(form.endsAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return { start, end }
  }, [form.startsAt, form.endsAt])

  useEffect(() => {
    const ids = timelineParticipants.map((p) => p.userId)
    // La frise couvre la journée entière : on interroge une fois par jour
    // affiché, pas à chaque déplacement du créneau.
    const askable = showForm && slotDates && ids.length > 0
    const timer = setTimeout(async () => {
      if (!askable) return setAvailability([])
      const dayStart = new Date(slotDates.start)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)
      setAvailLoading(true)
      try {
        setAvailability(await fetchAvailability({
          userIds: ids,
          from: dayStart.toISOString(),
          to: dayEnd.toISOString(),
        }, token))
      } catch {
        setAvailability([])
      } finally {
        setAvailLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer)
    // La dépendance porte sur le JOUR, pas sur l'heure : déplacer le créneau
    // dans la même journée ne relance pas la requête.
  }, [showForm, slotDates?.start?.toDateString(), form.participantIds, token, timelineParticipants])

  /** Déplace le créneau en conservant sa durée. */
  const moveSlotTo = useCallback((start) => {
    setForm((prev) => {
      const prevStart = new Date(prev.startsAt)
      const prevEnd = new Date(prev.endsAt)
      const durationMs = Math.max(15 * 60_000, prevEnd - prevStart)
      const end = new Date(start.getTime() + durationMs)
      return { ...prev, startsAt: toLocalInput(start), endsAt: toLocalInput(end) }
    })
  }, [])

  // --------------------------------------------------------- actions

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) return showToast('Donnez un titre à la réunion.', 'error')
    if (form.participantIds.length === 0) {
      return showToast('Invitez au moins un participant.', 'error')
    }
    setSaving(true)
    try {
      await createMeeting({
        title: form.title,
        description: form.description || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        participantIds: form.participantIds,
      }, token)
      showToast('Réunion planifiée. Les invités ont été notifiés.', 'success')
      setShowForm(false)
      setForm(emptyForm)
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const respond = async (meeting, response) => {
    try {
      await respondToMeeting(meeting.id, response, token)
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const cancel = async (meeting) => {
    if (!window.confirm(`Annuler la réunion « ${meeting.title} » ?`)) return
    try {
      await cancelMeeting(meeting.id, token)
      showToast('Réunion annulée.', 'success')
      await load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  /**
   * « Rejoindre » s'adapte au nombre de participants :
   *  - à deux, l'appel vidéo pair à pair convient ;
   *  - au-delà, le maillage WebRTC n'est pas implémenté, on ouvre donc un canal
   *    de discussion dédié, mémorisé côté serveur pour être réutilisé ensuite.
   */
  const join = async (meeting) => {
    const others = (meeting.participants ?? [])
      .map((p) => p.userId)
      .filter((id) => id !== user?.id)

    if (others.length === 1) {
      const peer = colleagues.find((c) => c.userId === others[0])
      if (!peer) {
        return showToast("Ce correspondant n'est pas dans vos contacts.", 'error')
      }
      if (callUnavailableReason) return showToast(callUnavailableReason, 'error')
      return startCall({ ...peer, type: 'DIRECT' }, 'VIDEO')
    }

    try {
      let channelId = meeting.channelId
      if (!channelId) {
        const group = await createChatGroup(
          meeting.title,
          (meeting.participants ?? []).map((p) => p.userId),
          token,
        )
        channelId = group?.id ?? group?.channelId
        if (channelId) await attachMeetingChannel(meeting.id, channelId, token)
        await refreshChannels()
      }
      if (!channelId) throw new Error('Canal introuvable')
      setActiveChannelId(channelId)
      navigate('/messages')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  // --------------------------------------------------------- rendu

  const renderCard = (meeting, isPast) => {
    const mine = meeting.organizerId === user?.id
    const me = (meeting.participants ?? []).find((p) => p.userId === user?.id)
    const cancelled = meeting.status === 'CANCELLED'
    const twoPeople = (meeting.participants ?? []).length === 2

    return (
      <article key={meeting.id} className={`meeting-card ${cancelled ? 'is-cancelled' : ''}`}>
        <header className="meeting-card-head">
          <div>
            <h3>{meeting.title}</h3>
            <p className="meeting-slot">{formatRange(meeting.startsAt, meeting.endsAt)}</p>
          </div>
          {cancelled && <span className="meeting-badge cancelled">Annulée</span>}
          {!cancelled && mine && <span className="meeting-badge organizer">Organisateur</span>}
        </header>

        {meeting.description && <p className="meeting-description">{meeting.description}</p>}

        <ul className="meeting-participants">
          {(meeting.participants ?? []).map((p) => (
            <li key={p.id} title={`${nameOf(p.userId)} — ${RESPONSE_LABEL[p.response]}`}>
              <span className="meeting-avatar">{initialsOf(nameOf(p.userId))}</span>
              <span className="meeting-participant-name">{nameOf(p.userId)}</span>
              <span className={`meeting-response ${p.response.toLowerCase()}`}>
                {RESPONSE_LABEL[p.response]}
              </span>
            </li>
          ))}
        </ul>

        {!cancelled && !isPast && (
          <footer className="meeting-actions">
            {me && me.response !== 'ACCEPTED' && (
              <button type="button" className="meeting-btn accept" onClick={() => respond(meeting, 'ACCEPTED')}>
                Accepter
              </button>
            )}
            {me && me.response !== 'TENTATIVE' && (
              <button type="button" className="meeting-btn tentative" onClick={() => respond(meeting, 'TENTATIVE')}>
                Peut-être
              </button>
            )}
            {me && me.response !== 'DECLINED' && (
              <button type="button" className="meeting-btn decline" onClick={() => respond(meeting, 'DECLINED')}>
                Refuser
              </button>
            )}
            <button type="button" className="meeting-btn join" onClick={() => join(meeting)}>
              {twoPeople ? <VideoIcon size="16px" /> : <PhoneIcon size="16px" />}
              <span>{twoPeople ? 'Rejoindre en visio' : 'Ouvrir la discussion'}</span>
            </button>
            {mine && (
              <button type="button" className="meeting-btn cancel" onClick={() => cancel(meeting)}>
                Annuler
              </button>
            )}
          </footer>
        )}
      </article>
    )
  }

  return (
    <div className="meetings-page">
      <header className="meetings-header">
        <div>
          <h1><CalendarIcon size="24px" /> Réunions</h1>
          <p>Planifiez vos réunions et suivez les réponses de vos invités.</p>
        </div>
        <button type="button" className="meeting-primary-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : 'Planifier une réunion'}
        </button>
      </header>

      {showForm && (
        <form className="meeting-form" onSubmit={submit}>
          <div className="meeting-form-grid">
            <label>
              <span>Titre *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Point d'avancement hebdomadaire"
                maxLength={200}
                required
              />
            </label>
            <label>
              <span>Début *</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Fin *</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                required
              />
            </label>
          </div>

          <label className="meeting-form-full">
            <span>Ordre du jour</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              maxLength={4000}
            />
          </label>

          <fieldset className="meeting-participants-picker">
            <legend>Participants * ({form.participantIds.length} sélectionné{form.participantIds.length > 1 ? 's' : ''})</legend>
            {colleagues.length === 0 ? (
              <p className="meeting-empty">Aucun collaborateur disponible.</p>
            ) : (
              <div className="meeting-picker-list">
                {colleagues.map((c) => (
                  <label key={c.userId} className="meeting-picker-item">
                    <input
                      type="checkbox"
                      checked={form.participantIds.includes(c.userId)}
                      onChange={(e) => setForm({
                        ...form,
                        participantIds: e.target.checked
                          ? [...form.participantIds, c.userId]
                          : form.participantIds.filter((id) => id !== c.userId),
                      })}
                    />
                    <span className="meeting-avatar">{initialsOf(c.name)}</span>
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="availability-panel">
            <h4>Disponibilité des participants</h4>
            <AvailabilityTimeline
              day={slotDates?.start ?? new Date()}
              participants={timelineParticipants}
              availability={availability}
              slot={slotDates}
              onPickStart={moveSlotTo}
              loading={availLoading}
            />
          </div>

          <div className="meeting-form-actions">
            <button type="submit" className="meeting-primary-btn" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Planifier'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="meeting-empty">Chargement des réunions…</p>
      ) : error ? (
        <p className="meeting-error">{error}</p>
      ) : (
        <>
          <section>
            <h2>À venir ({upcoming.length})</h2>
            {upcoming.length === 0
              ? <p className="meeting-empty">Aucune réunion à venir.</p>
              : upcoming.map((m) => renderCard(m, false))}
          </section>

          {past.length > 0 && (
            <section>
              <h2>Passées ({past.length})</h2>
              {past.slice(0, 10).map((m) => renderCard(m, true))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
