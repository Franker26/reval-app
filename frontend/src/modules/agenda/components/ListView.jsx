import React, { useMemo } from 'react'
import { defaultColor, eventTimeLabel } from './agendaUtils.js'

export default function ListView({ events, onEventClick }) {
  const grouped = useMemo(() => {
    const map = new Map()
    const sorted = [...events].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))

    for (const event of sorted) {
      const key = new Date(event.start_datetime).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(event)
    }

    return map
  }, [events])

  if (!events.length) {
    return null
  }

  return (
    <div className="agenda-list-view">
      {Array.from(grouped.entries()).map(([day, dayEvents]) => (
        <div key={day} className="agenda-list-group">
          <div className="agenda-list-group__header">{day}</div>
          {dayEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              className="agenda-list-item"
              onClick={() => onEventClick(event)}
            >
              <span className="agenda-list-item__color" style={{ background: event.color || defaultColor() }} />
              <div className="agenda-list-item__body">
                <strong>{event.title}</strong>
                <span>{event.description || 'Evento del workspace'}</span>
                {event.location ? <small className="agenda-list-item__location">{event.location}</small> : null}
              </div>
              <div className="agenda-list-item__time">{eventTimeLabel(event)}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
