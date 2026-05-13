import React from 'react'
import { DAYS_ES, defaultColor, eventTimeLabel } from './agendaUtils.js'

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function eventIntersectsDay(event, date) {
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime || event.start_datetime)
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  return start <= dayEnd && end >= dayStart
}

export default function WeekView({ weekStart, events, onDayClick, onEventClick }) {
  const START_HOUR = 6
  const END_HOUR = 22
  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return day
  })
  const halfHourSlots = Array.from({ length: totalMinutes / 30 + 1 }, (_, index) => {
    const minutes = START_HOUR * 60 + index * 30
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    return {
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      isMajor: minute === 0,
      top: (index / (totalMinutes / 30)) * 100,
    }
  })
  const currentWeekHasToday = days.some((day) => isSameDay(day, today))
  const nowMinutes = (today.getHours() - START_HOUR) * 60 + today.getMinutes()
  const showNowLine = currentWeekHasToday && nowMinutes >= 0 && nowMinutes <= totalMinutes
  const nowLineTop = (nowMinutes / totalMinutes) * 100
  const todayStart = startOfDay(today)
  const solidDayCount = days.filter((date) => startOfDay(date).getTime() <= todayStart.getTime()).length
  const solidWidth = (solidDayCount / 7) * 100

  function mapTimedEvent(event, date) {
    const eventStart = new Date(event.start_datetime)
    const eventEnd = new Date(event.end_datetime || event.start_datetime)
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), START_HOUR, 0, 0, 0)
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), END_HOUR, 0, 0, 0)
    const clampedStart = Math.max(eventStart.getTime(), dayStart.getTime())
    const clampedEnd = Math.max(Math.min(eventEnd.getTime(), dayEnd.getTime()), clampedStart + 30 * 60 * 1000)
    const startMinutes = (clampedStart - dayStart.getTime()) / (60 * 1000)
    const endMinutes = (clampedEnd - dayStart.getTime()) / (60 * 1000)

    return {
      ...event,
      top: (startMinutes / totalMinutes) * 100,
      height: Math.max(((endMinutes - startMinutes) / totalMinutes) * 100, 7),
    }
  }

  return (
    <div className="agenda-week-board">
      <div className="agenda-week-board__header">
        <div className="agenda-week-board__corner" />
        {days.map((date) => {
          const isToday = isSameDay(date, today)
          const allDayCount = events.filter((event) => eventIntersectsDay(event, date) && event.all_day).length
          return (
            <button
              key={`header-${date.toISOString()}`}
              type="button"
              className={`agenda-week-board__day-head${isToday ? ' is-today' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="agenda-week-board__day-name">{DAYS_ES[date.getDay()]}</span>
              <strong className="agenda-week-board__day-num">{date.getDate()}</strong>
              <small>{allDayCount ? `${allDayCount} todo el día` : 'Disponible'}</small>
            </button>
          )
        })}
      </div>

      <div className="agenda-week-board__body">
        <div className="agenda-week-board__times" aria-hidden="true">
          {halfHourSlots.map((slot) => (
            <div key={slot.label} className={`agenda-week-board__time-slot${slot.isMajor ? ' is-major' : ' is-minor'}`}>
              <span>{slot.label}</span>
            </div>
          ))}
        </div>

        <div className="agenda-week-board__columns">
          {halfHourSlots.slice(0, -1).map((slot) => (
            <div
              key={`line-${slot.label}`}
              className={`agenda-week-board__line${slot.isMajor ? ' is-major' : ' is-minor'}`}
              style={{ top: `${slot.top}%` }}
            />
          ))}

          {showNowLine && solidDayCount > 0 ? (
            <div
              className="agenda-week-board__now-range is-solid"
              style={{ top: `${nowLineTop}%`, left: '0%', width: `${solidWidth}%` }}
            />
          ) : null}

          {showNowLine && solidDayCount < 7 ? (
            <div
              className="agenda-week-board__now-range is-dashed"
              style={{ top: `${nowLineTop}%`, left: `${solidWidth}%`, width: `${100 - solidWidth}%` }}
            />
          ) : null}

          {days.map((date) => {
            const dayEvents = events.filter((event) => eventIntersectsDay(event, date))
            const timedEvents = dayEvents
              .filter((event) => !event.all_day)
              .map((event) => mapTimedEvent(event, date))
            const isToday = isSameDay(date, today)

            return (
              <div
                key={date.toISOString()}
                className={`agenda-week-board__day-col${isToday ? ' is-today' : ''}`}
                onClick={() => onDayClick(date)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onDayClick(date)
                  }
                }}
              >
                {timedEvents.length ? timedEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="agenda-week-block"
                    style={{
                      top: `${event.top}%`,
                      height: `${event.height}%`,
                      borderColor: event.color || defaultColor(),
                      background: event.color ? `${event.color}18` : 'rgba(var(--primary-rgb), 0.08)',
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEventClick(event)
                    }}
                  >
                    <strong>{event.title}</strong>
                    <span>{eventTimeLabel(event)}</span>
                  </button>
                )) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
