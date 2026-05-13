import React from 'react'
import { MONTHS_ES, startOfWeek } from './agendaUtils.js'

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function endOfWeek(date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
}

function monthMatrix(year, month) {
  const firstDay = new Date(year, month, 1)
  const start = startOfWeek(firstDay)
  return Array.from({ length: 6 }, (_, weekIndex) => (
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start)
      date.setDate(start.getDate() + weekIndex * 7 + dayIndex)
      return date
    })
  ))
}

export default function MiniMonthSidebar({ year, month, selectedDate, onSelectDate, branding, events, integrations }) {
  const weeks = monthMatrix(year, month)
  const monthLabel = `${MONTHS_ES[month]} ${year}`
  const selectedWeekStart = selectedDate ? startOfWeek(selectedDate) : null
  const selectedWeekEnd = selectedWeekStart ? endOfWeek(selectedDate) : null
  const googleConnected = Boolean(integrations?.google?.connected)
  const icalConnected = Boolean(integrations?.ical?.connected)
  const calendarItems = [
    { label: branding.app_name || 'Workspace', tone: 'workspace' },
    ...(googleConnected ? [{ label: 'Google Calendar', tone: 'google' }] : []),
    ...(icalConnected ? [{ label: 'Apple Calendar', tone: 'apple' }] : []),
  ]
  const visibleCount = events.length

  return (
    <aside className="agenda-teams-sidebar">
      <div className="agenda-teams-sidebar__month">
        <div className="agenda-teams-sidebar__month-header">
          <strong>{monthLabel}</strong>
        </div>
        <div className="agenda-teams-sidebar__weekdays">
          {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="agenda-teams-sidebar__grid">
          {weeks.flat().map((date) => {
            const outside = date.getMonth() !== month
            const selected = selectedDate && isSameDay(date, selectedDate)
            const inSelectedWeek = selectedWeekStart && selectedWeekEnd && date >= selectedWeekStart && date <= selectedWeekEnd
            const isWeekStart = inSelectedWeek && date.getDay() === 0
            const isWeekEnd = inSelectedWeek && date.getDay() === 6
            const today = isSameDay(date, new Date())
            return (
              <button
                key={date.toISOString()}
                type="button"
                className={`agenda-teams-mini-day${outside ? ' is-outside' : ''}${selected ? ' is-selected' : ''}${today ? ' is-today' : ''}${inSelectedWeek ? ' is-in-week' : ''}${isWeekStart ? ' is-week-start' : ''}${isWeekEnd ? ' is-week-end' : ''}`}
                onClick={() => onSelectDate(date)}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      <div className="agenda-teams-sidebar__panel">
        <span className="agenda-teams-sidebar__label">Calendarios</span>
        <div className="agenda-teams-sidebar__list">
          {calendarItems.map((item) => (
            <div key={item.label} className="agenda-teams-sidebar__list-item">
              <span className={`agenda-teams-sidebar__dot agenda-teams-sidebar__dot--${item.tone}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="agenda-teams-sidebar__panel">
        <span className="agenda-teams-sidebar__label">Semana visible</span>
        <strong className="agenda-teams-sidebar__metric">{visibleCount} eventos</strong>
        <small>{visibleCount ? 'Eventos sincronizados en este rango.' : 'Sin actividad cargada en esta semana.'}</small>
      </div>
    </aside>
  )
}
