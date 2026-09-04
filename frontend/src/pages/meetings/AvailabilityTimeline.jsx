import { useMemo } from 'react'

/**
 * Frise de disponibilité : une ligne par participant, les heures en abscisse.
 *
 * Elle répond à la question posée avant de fixer un créneau — « qui est
 * libre ? » — là où un simple avertissement de conflit arrive trop tard.
 * Cliquer sur une case libre positionne le créneau à cette heure.
 */

const DAY_START = 8   // 8 h
const DAY_END = 20    // 20 h
const SLOT_MINUTES = 30
const SLOTS = ((DAY_END - DAY_START) * 60) / SLOT_MINUTES

const minutesFromDayStart = (date, dayRef) => {
  const ref = new Date(dayRef)
  ref.setHours(DAY_START, 0, 0, 0)
  return (date.getTime() - ref.getTime()) / 60_000
}

const clampPercent = (value) => Math.max(0, Math.min(100, value))

export default function AvailabilityTimeline({
  day,                 // Date : jour affiché
  participants,        // [{ userId, name }]
  availability,        // [{ userId, busy: [{start,end,title}], absences: [] }]
  slot,                // { start: Date, end: Date } créneau envisagé
  onPickStart,         // (Date) => void
  loading,
}) {
  const dayKey = useMemo(() => {
    const d = new Date(day)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [day])

  const byUser = useMemo(() => {
    const map = new Map()
    for (const entry of availability ?? []) map.set(entry.userId, entry)
    return map
  }, [availability])

  const totalMinutes = (DAY_END - DAY_START) * 60

  /** Position et largeur d'un intervalle, en pourcentage de la journée. */
  const bandStyle = (startISO, endISO) => {
    const start = minutesFromDayStart(new Date(startISO), day)
    const end = minutesFromDayStart(new Date(endISO), day)
    const left = clampPercent((start / totalMinutes) * 100)
    const right = clampPercent((end / totalMinutes) * 100)
    return { left: `${left}%`, width: `${Math.max(1, right - left)}%` }
  }

  // Participants indisponibles sur le créneau envisagé : c'est le verdict que
  // l'organisateur lit en premier.
  const unavailable = useMemo(() => {
    if (!slot?.start || !slot?.end) return []
    return (participants ?? []).filter(({ userId }) => {
      const entry = byUser.get(userId)
      if (!entry) return false
      if ((entry.absences ?? []).includes(dayKey)) return true
      return (entry.busy ?? []).some(
        (b) => new Date(b.start) < slot.end && new Date(b.end) > slot.start,
      )
    })
  }, [participants, byUser, slot, dayKey])

  const hours = useMemo(
    () => Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i),
    [],
  )

  const handleSlotClick = (index) => {
    const picked = new Date(day)
    picked.setHours(DAY_START, index * SLOT_MINUTES, 0, 0)
    onPickStart?.(picked)
  }

  if (!participants?.length) {
    return (
      <p className="availability-hint">
        Sélectionnez des participants pour voir leur disponibilité.
      </p>
    )
  }

  return (
    <div className="availability">
      <div className="availability-verdict">
        {loading ? (
          <span className="verdict-loading">Vérification des disponibilités…</span>
        ) : unavailable.length === 0 ? (
          <span className="verdict-ok">✓ Tous les participants sont libres sur ce créneau</span>
        ) : (
          <span className="verdict-busy">
            {unavailable.length} participant{unavailable.length > 1 ? 's' : ''} indisponible
            {unavailable.length > 1 ? 's' : ''} : {unavailable.map((p) => p.name).join(', ')}
          </span>
        )}
      </div>

      <div className="availability-grid">
        {/* Échelle horaire */}
        <div className="availability-row availability-hours">
          <div className="availability-name" />
          <div className="availability-track">
            {hours.map((h) => (
              <span
                key={h}
                className="availability-hour"
                style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
              >
                {h}h
              </span>
            ))}
          </div>
        </div>

        {participants.map(({ userId, name }) => {
          const entry = byUser.get(userId)
          const onLeave = (entry?.absences ?? []).includes(dayKey)
          return (
            <div className="availability-row" key={userId}>
              <div className="availability-name" title={name}>{name}</div>
              <div className="availability-track">
                {/* Cases cliquables, en fond */}
                {Array.from({ length: SLOTS }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="availability-cell"
                    style={{ left: `${(i / SLOTS) * 100}%`, width: `${100 / SLOTS}%` }}
                    onClick={() => handleSlotClick(i)}
                    title="Placer le créneau ici"
                    aria-label={`Placer le créneau à ${
                      DAY_START + Math.floor((i * SLOT_MINUTES) / 60)
                    }h${(i * SLOT_MINUTES) % 60 ? '30' : '00'}`}
                  />
                ))}

                {onLeave ? (
                  <div className="availability-leave">Congé</div>
                ) : (
                  (entry?.busy ?? []).map((b) => (
                    <div
                      key={b.meetingId}
                      className="availability-busy"
                      style={bandStyle(b.start, b.end)}
                      // Le titre n'est fourni par le serveur que si l'appelant
                      // participe aussi à cette réunion.
                      title={b.title ?? 'Occupé'}
                    >
                      {b.title ?? ''}
                    </div>
                  ))
                )}

                {/* Créneau envisagé, au-dessus de tout */}
                {slot?.start && slot?.end && (
                  <div
                    className="availability-slot"
                    style={bandStyle(slot.start.toISOString(), slot.end.toISOString())}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="availability-hint">
        Cliquez sur la frise pour déplacer le créneau. Les plages colorées sont déjà occupées.
      </p>
    </div>
  )
}
