import React from 'react'
import { DAYS_ES, startOfMonth, startOfWeek, monthEventRowStyle } from './agendaUtils.js'

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function eventIntersectsDay(event, date) {
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime || event.start_datetime)
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  return start <= endOfDay && end >= startOfDay
}

function fmtTimeDisplay(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function MonthGrid({ year, month, events, onDayClick, onEventClick }) {
  const firstDay = startOfMonth(year, month)
  const totalDays = daysInMonth(year, month)
  const startWeekday = firstDay.getDay()
  const cells = []
  const today = new Date()
  const trailingDays = (7 - ((startWeekday + totalDays) % 7)) % 7

  for (let i = startWeekday - 1; i >= 0; i--) {
    const date = new Date(year, month, -i)
    cells.push({ date, day: date.getDate(), isOutside: true })
  }

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day)
    cells.push({ date, day, isOutside: false })
  }

  for (let i = 1; i <= trailingDays; i++) {
    const date = new Date(year, month + 1, i)
    cells.push({ date, day: i, isOutside: true })
  }

  return (
    <div className="agenda-month-grid">
      <div className="agenda-month-header-row">
        {DAYS_ES.map((day) => (
          <div key={day} className="agenda-month-header-cell">{day}</div>
        ))}
      </div>

      <div className="agenda-month-cells">
        {cells.map((cell) => {
          const { date, day, isOutside } = cell
          const isToday = isSameDay(date, today)
          const dayEvents = events.filter((event) => eventIntersectsDay(event, date))

          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`agenda-month-cell${isToday ? ' agenda-month-cell--today' : ''}${isOutside ? ' agenda-month-cell--outside' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <div className="agenda-month-cell__header">
                <span className="agenda-month-cell__day">{day}</span>
              </div>

              <div className="agenda-month-cell__events">
                {dayEvents.slice(0, 6).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="agenda-event-pill"
                    style={monthEventRowStyle(event.color)}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEventClick(event)
                    }}
                    title={event.title}
                  >
                    {!event.all_day ? <span className="agenda-event-pill__time">{fmtTimeDisplay(event.start_datetime)}</span> : null}
                    <span className="agenda-event-pill__title">{event.title}</span>
                  </button>
                ))}

                {dayEvents.length > 6 ? (
                  <span className="agenda-event-pill--more">+{dayEvents.length - 6} más</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
