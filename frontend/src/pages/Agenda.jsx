import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createEvent,
  createIcalFeed,
  deleteEvent,
  deleteIcalFeed,
  disconnectGoogle,
  getAvailableIntegrations,
  getGoogleAuthUrl,
  listEvents,
  listIntegrations,
  syncGoogle,
  updateEvent,
} from '../api.js'
import InlineNotice from '../components/InlineNotice.jsx'
import { LoadingState } from '../components/StatusState.jsx'
import { getCachedBrandingPayload } from '../theme.js'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const EVENT_COLORS = [
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Naranja' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#64748b', label: 'Gris' },
]

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sin repetición' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Todas las semanas' },
  { value: 'monthly', label: 'Todos los meses' },
]

function defaultColor() {
  return EVENT_COLORS[0].value
}

function startOfMonth(year, month) {
  return new Date(year, month, 1)
}

function endOfMonth(year, month) {
  return new Date(year, month + 1, 0, 23, 59, 59, 999)
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function startOfWeek(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() - next.getDay())
  return next
}

function endOfWeek(date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
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

function fmtDateInput(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtTimeDisplay(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLong(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function fmtDateTimeLong(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function recurrencePresetFromRule(rule = '') {
  if (!rule) return 'none'
  if (rule.includes('FREQ=DAILY')) return 'daily'
  if (rule.includes('FREQ=WEEKLY')) return 'weekly'
  if (rule.includes('FREQ=MONTHLY')) return 'monthly'
  return 'none'
}

function recurrenceRuleFromPreset(value) {
  if (value === 'daily') return 'FREQ=DAILY'
  if (value === 'weekly') return 'FREQ=WEEKLY'
  if (value === 'monthly') return 'FREQ=MONTHLY'
  return ''
}

function roundToNextHour(date) {
  const next = new Date(date)
  next.setMinutes(0, 0, 0)
  next.setHours(next.getHours() + 1)
  return next
}

function buildDefaultWindow(seedDate) {
  const now = new Date()

  if (!seedDate) {
    const start = roundToNextHour(now)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    return { start, end }
  }

  const day = new Date(seedDate)
  day.setSeconds(0, 0)
  const hasTime = day.getHours() !== 0 || day.getMinutes() !== 0

  if (hasTime) {
    return {
      start: day,
      end: new Date(day.getTime() + 60 * 60 * 1000),
    }
  }

  const start = new Date(day)
  start.setHours(isSameDay(day, now) ? Math.max(9, roundToNextHour(now).getHours()) : 9, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

function parseInputAsDate(value, allDay, isEnd = false) {
  if (!value) return null

  if (allDay) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0)
  }

  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

function emptyForm(defaults = {}) {
  const { start, end } = buildDefaultWindow(defaults.start || defaults.start_datetime)
  const fallbackEnd = defaults.end || defaults.end_datetime || end

  return {
    title: '',
    description: '',
    location: '',
    start_datetime: fmtDateInput(start),
    end_datetime: fmtDateInput(fallbackEnd),
    all_day: false,
    color: defaultColor(),
    recurrence: 'none',
    ...defaults,
  }
}

function eventTimeLabel(event) {
  if (event.all_day) return 'Todo el día'
  return `${fmtTimeDisplay(event.start_datetime)} – ${fmtTimeDisplay(event.end_datetime)}`
}

function upcomingEvent(events) {
  const now = new Date()
  return [...events]
    .filter((event) => new Date(event.end_datetime || event.start_datetime) >= now)
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))[0] || null
}

function AgendaEmptyState({ onCreate }) {
  return (
    <div className="agenda-empty-state">
      <span className="agenda-empty-state__eyebrow">Sin actividad visible</span>
      <h3>No hay eventos para este rango</h3>
      <p>Podés crear un nuevo evento, cambiar de vista o moverte a otra fecha para revisar la agenda del equipo.</p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        + Nuevo evento
      </button>
    </div>
  )
}

function AgendaStat({ label, value, note, accent = 'default' }) {
  return (
    <article className={`agenda-stat agenda-stat--${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function EventModal({ mode, event, onSave, onDelete, onClose, saving, deleting }) {
  const [form, setForm] = useState(() => {
    if (mode === 'edit' && event) {
      return {
        title: event.title || '',
        description: event.description || '',
        location: event.location || '',
        start_datetime: fmtDateInput(event.start_datetime),
        end_datetime: fmtDateInput(event.end_datetime),
        all_day: event.all_day || false,
        color: event.color || defaultColor(),
        recurrence: recurrencePresetFromRule(event.recurrence_rule),
      }
    }
    return emptyForm(event)
  })
  const [submitError, setSubmitError] = useState(null)

  function set(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setSubmitError(null)
      setForm((current) => ({ ...current, [field]: value }))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const start = parseInputAsDate(form.all_day ? form.start_datetime.slice(0, 10) : form.start_datetime, form.all_day, false)
    const end = parseInputAsDate(form.all_day ? form.end_datetime.slice(0, 10) : form.end_datetime, form.all_day, true)

    if (!form.title.trim()) {
      setSubmitError('El evento necesita un título.')
      return
    }

    if (!start || !end || end < start) {
      setSubmitError('La fecha de fin debe ser posterior a la de inicio.')
      return
    }

    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      all_day: form.all_day,
      color: form.color,
      recurrence_rule: recurrenceRuleFromPreset(form.recurrence),
    })
  }

  return (
    <div className="agenda-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="agenda-event-title">
        <div className="agenda-modal__hero">
          <div>
            <span className="agenda-modal__eyebrow">{mode === 'edit' ? 'Editar evento' : 'Nuevo evento'}</span>
            <h2 id="agenda-event-title">{mode === 'edit' ? 'Actualizá la agenda del equipo' : 'Creá una nueva instancia en agenda'}</h2>
            <p>Definí horario, contexto y recordatorio visual para que el workspace mantenga una lectura clara.</p>
          </div>
          <button type="button" className="agenda-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form className="agenda-modal__body" onSubmit={handleSubmit}>
          {submitError ? (
            <InlineNotice
              tone="error"
              title="Revisá los datos del evento"
              description={submitError}
              compact
            />
          ) : null}

          <div className="agenda-modal__preview">
            <span className="agenda-modal__preview-dot" style={{ background: form.color }} />
            <div>
              <strong>{form.title.trim() || 'Evento sin título'}</strong>
              <small>{form.all_day ? 'Todo el día' : `${form.start_datetime.slice(0, 16).replace('T', ' · ')} hs`}</small>
            </div>
          </div>

          <div className="agenda-field">
            <label>Título *</label>
            <input
              className="agenda-input"
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="Nombre del evento"
              autoFocus
            />
          </div>

          <div className="agenda-field-row">
            <div className="agenda-field">
              <label>Inicio</label>
              <input
                className="agenda-input"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.all_day ? form.start_datetime.slice(0, 10) : form.start_datetime}
                onChange={set('start_datetime')}
              />
            </div>
            <div className="agenda-field">
              <label>Fin</label>
              <input
                className="agenda-input"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.all_day ? form.end_datetime.slice(0, 10) : form.end_datetime}
                onChange={set('end_datetime')}
              />
            </div>
          </div>

          <div className="agenda-field-row agenda-field-row--meta">
            <label className="agenda-checkbox-label">
              <input type="checkbox" checked={form.all_day} onChange={set('all_day')} />
              <span>Todo el día</span>
            </label>

            <div className="agenda-field">
              <label>Repetición</label>
              <select className="agenda-input" value={form.recurrence} onChange={set('recurrence')}>
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="agenda-field">
            <label>Ubicación</label>
            <input
              className="agenda-input"
              type="text"
              value={form.location}
              onChange={set('location')}
              placeholder="Dirección, sala o enlace de reunión"
            />
          </div>

          <div className="agenda-field">
            <label>Descripción</label>
            <textarea
              className="agenda-input agenda-textarea"
              rows={4}
              value={form.description}
              onChange={set('description')}
              placeholder="Notas, contexto o próximos pasos"
            />
          </div>

          <div className="agenda-field">
            <label>Color</label>
            <div className="agenda-color-picker">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`agenda-color-swatch${form.color === color.value ? ' is-selected' : ''}`}
                  style={{ background: color.value }}
                  title={color.label}
                  onClick={() => setForm((current) => ({ ...current, color: color.value }))}
                />
              ))}
            </div>
          </div>

          <div className="agenda-modal__footer">
            {mode === 'edit' ? (
              <button
                type="button"
                className="btn btn-secondary agenda-btn-delete"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            ) : <span />}

            <div className="agenda-modal__footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function IntegrationsPanel({ integrations, available, onRefresh }) {
  const [loadingAction, setLoadingAction] = useState(null)
  const [error, setError] = useState(null)
  const [syncResult, setSyncResult] = useState(null)
  const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

  async function act(label, fn) {
    setLoadingAction(label)
    setError(null)
    setSyncResult(null)
    try {
      const result = await fn()
      onRefresh()
      return result
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleGoogleConnect() {
    await act('google-connect', async () => {
      const data = await getGoogleAuthUrl()
      window.location.href = data.url
    })
  }

  async function handleGoogleSync() {
    const result = await act('google-sync', syncGoogle)
    if (result) setSyncResult(`Google Calendar sincronizado: ${result.pushed} enviados y ${result.pulled} importados.`)
  }

  async function handleIcalCreate() {
    await act('ical-create', createIcalFeed)
  }

  async function handleIcalDelete() {
    await act('ical-delete', deleteIcalFeed)
  }

  async function handleGoogleDisconnect() {
    await act('google-disconnect', disconnectGoogle)
  }

  const googleConnected = Boolean(integrations?.google?.connected)
  const icalConnected = Boolean(integrations?.ical?.connected)
  const icalToken = integrations?.ical?.token
  const icalFeedUrl = icalToken ? `${API_BASE}/api/agenda/ical/${icalToken}` : null

  return (
    <section className="agenda-side-card agenda-side-card--integrations">
      <div className="agenda-side-card__header">
        <span className="home-panel__eyebrow">Sincronización</span>
        <strong>Calendarios externos</strong>
        <p>Conectá proveedores para compartir disponibilidad o mantener copias de seguridad fuera del workspace.</p>
      </div>

      {error ? (
        <InlineNotice
          tone="error"
          title="No pudimos completar la acción"
          description={error}
          compact
        />
      ) : null}

      {syncResult ? (
        <InlineNotice
          tone="success"
          title="Sincronización completa"
          description={syncResult}
          compact
        />
      ) : null}

      <div className="agenda-integrations__list">
        {(available?.google || googleConnected) ? (
          <div className="agenda-integration-card">
            <div className="agenda-integration-card__icon agenda-integration-card__icon--google">G</div>
            <div className="agenda-integration-card__body">
              <strong>Google Calendar</strong>
              <span>{googleConnected ? 'Cuenta conectada y lista para sincronizar manualmente.' : 'Disponible para conectar desde este workspace.'}</span>
            </div>
            <div className="agenda-integration-card__actions">
              {googleConnected ? (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleGoogleSync} disabled={Boolean(loadingAction)}>
                    {loadingAction === 'google-sync' ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleGoogleDisconnect} disabled={Boolean(loadingAction)}>
                    Desconectar
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={handleGoogleConnect} disabled={Boolean(loadingAction)}>
                  {loadingAction === 'google-connect' ? 'Redirigiendo...' : 'Conectar'}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="agenda-integration-card">
          <div className="agenda-integration-card__icon agenda-integration-card__icon--apple">A</div>
          <div className="agenda-integration-card__body">
            <strong>Apple Calendar</strong>
            <span>{icalConnected ? 'Feed activo para suscripción externa.' : 'Generá un feed iCal para compartir eventos.'}</span>
            {icalFeedUrl ? (
              <a href={`webcal://${icalFeedUrl.replace(/^https?:\/\//, '')}`} className="agenda-ical-link">
                Suscribirse con Apple Calendar
              </a>
            ) : null}
          </div>
          <div className="agenda-integration-card__actions">
            {icalConnected ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigator.clipboard.writeText(icalFeedUrl)}
                >
                  Copiar URL
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleIcalDelete} disabled={Boolean(loadingAction)}>
                  Revocar
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleIcalCreate} disabled={Boolean(loadingAction)}>
                {loadingAction === 'ical-create' ? 'Generando...' : 'Generar feed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function MonthGrid({ year, month, events, onDayClick, onEventClick }) {
  const firstDay = startOfMonth(year, month)
  const totalDays = daysInMonth(year, month)
  const startWeekday = firstDay.getDay()
  const cells = []
  const today = new Date()

  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= totalDays; day++) cells.push(day)

  return (
    <div className="agenda-month-grid">
      <div className="agenda-month-header-row">
        {DAYS_ES.map((day) => (
          <div key={day} className="agenda-month-header-cell">{day}</div>
        ))}
      </div>

      <div className="agenda-month-cells">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="agenda-month-cell agenda-month-cell--empty" />

          const date = new Date(year, month, day)
          const isToday = isSameDay(date, today)
          const dayEvents = events.filter((event) => eventIntersectsDay(event, date))

          return (
            <button
              key={day}
              type="button"
              className={`agenda-month-cell${isToday ? ' agenda-month-cell--today' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="agenda-month-cell__day">{day}</span>

              <div className="agenda-month-cell__events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="agenda-event-pill"
                    style={{ background: event.color || defaultColor() }}
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

                {dayEvents.length > 3 ? (
                  <span className="agenda-event-pill--more">+{dayEvents.length - 3} más</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ weekStart, events, onDayClick, onEventClick }) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return day
  })

  return (
    <div className="agenda-week-grid">
      {days.map((date) => {
        const dayEvents = events.filter((event) => eventIntersectsDay(event, date))
        const isToday = isSameDay(date, today)

        return (
          <button
            key={date.toISOString()}
            type="button"
            className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}`}
            onClick={() => onDayClick(date)}
          >
            <div className="agenda-week-col__header">
              <span className="agenda-week-col__day-name">{DAYS_ES[date.getDay()]}</span>
              <span className={`agenda-week-col__day-num${isToday ? ' is-today' : ''}`}>{date.getDate()}</span>
            </div>

            <div className="agenda-week-col__events">
              {dayEvents.length ? dayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="agenda-week-event"
                  style={{ borderLeftColor: event.color || defaultColor() }}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onEventClick(event)
                  }}
                >
                  <span className="agenda-week-event__time">{eventTimeLabel(event)}</span>
                  <span className="agenda-week-event__title">{event.title}</span>
                </button>
              )) : (
                <span className="agenda-week-col__hint">Sin eventos</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ListView({ events, onEventClick }) {
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

export default function Agenda() {
  const [searchParams] = useSearchParams()
  const today = new Date()
  const branding = getCachedBrandingPayload()

  const [viewMode, setViewMode] = useState('month')
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [weekStartDate, setWeekStartDate] = useState(() => startOfWeek(today))

  const [events, setEvents] = useState([])
  const [integrations, setIntegrations] = useState({})
  const [available, setAvailable] = useState({ google: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalError, setModalError] = useState(null)

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showIntegrations, setShowIntegrations] = useState(true)
  const [connectedProvider, setConnectedProvider] = useState(null)

  useEffect(() => {
    const provider = searchParams.get('connected')
    if (provider) {
      setConnectedProvider(provider)
      setShowIntegrations(true)
    }
  }, [searchParams])

  const visibleRange = useMemo(() => {
    if (viewMode === 'week') {
      return {
        from: startOfWeek(weekStartDate),
        to: endOfWeek(weekStartDate),
      }
    }

    return {
      from: startOfMonth(currentYear, currentMonth),
      to: endOfMonth(currentYear, currentMonth),
    }
  }, [currentMonth, currentYear, viewMode, weekStartDate])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [eventData, integrationData, availableData] = await Promise.all([
          listEvents(visibleRange.from.toISOString(), visibleRange.to.toISOString()),
          listIntegrations().catch(() => ({})),
          getAvailableIntegrations().catch(() => ({ google: false })),
        ])

        if (!cancelled) {
          setEvents(eventData)
          setIntegrations(integrationData)
          setAvailable(availableData)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [visibleRange])

  async function reloadIntegrations() {
    try {
      const [integrationData, availableData] = await Promise.all([
        listIntegrations(),
        getAvailableIntegrations(),
      ])
      setIntegrations(integrationData)
      setAvailable(availableData)
    } catch {
      // Las integraciones son opcionales para esta vista.
    }
  }

  function syncMonthFromDate(date) {
    setCurrentYear(date.getFullYear())
    setCurrentMonth(date.getMonth())
  }

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentYear((year) => year - 1)
      setCurrentMonth(11)
      return
    }
    setCurrentMonth((month) => month - 1)
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentYear((year) => year + 1)
      setCurrentMonth(0)
      return
    }
    setCurrentMonth((month) => month + 1)
  }

  function prevWeek() {
    const next = new Date(weekStartDate)
    next.setDate(next.getDate() - 7)
    setWeekStartDate(next)
    syncMonthFromDate(next)
  }

  function nextWeek() {
    const next = new Date(weekStartDate)
    next.setDate(next.getDate() + 7)
    setWeekStartDate(next)
    syncMonthFromDate(next)
  }

  function goToToday() {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
    setWeekStartDate(startOfWeek(now))
  }

  function handleDayClick(date) {
    const { start, end } = buildDefaultWindow(date)
    setModal({
      mode: 'create',
      defaults: { start, end },
    })
    setModalError(null)
  }

  function handleEventClick(event) {
    setModal({ mode: 'edit', event })
    setModalError(null)
  }

  async function handleSave(formData) {
    setSaving(true)
    setModalError(null)
    setError(null)

    try {
      if (modal.mode === 'edit') {
        const updated = await updateEvent(modal.event.id, formData)
        setEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)))
      } else {
        const created = await createEvent(formData)
        setEvents((current) => [...current, created].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime)))
      }
      setModal(null)
    } catch (e) {
      setModalError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!modal?.event) return

    setDeleting(true)
    setModalError(null)
    setError(null)

    try {
      await deleteEvent(modal.event.id)
      setEvents((current) => current.filter((event) => event.id !== modal.event.id))
      setModal(null)
    } catch (e) {
      setModalError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const nextEvent = useMemo(() => upcomingEvent(events), [events])
  const googleConnected = Boolean(integrations?.google?.connected)
  const icalConnected = Boolean(integrations?.ical?.connected)
  const connectedCount = Number(googleConnected) + Number(icalConnected)
  const anyAvailable = Boolean(available?.google || connectedCount)

  const periodLabel = viewMode === 'week'
    ? `${visibleRange.from.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${visibleRange.to.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${MONTHS_ES[currentMonth]} ${currentYear}`
  const activeViewLabel = viewMode === 'month' ? 'Vista mensual' : viewMode === 'week' ? 'Vista semanal' : 'Vista en lista'
  const nextEventLabel = nextEvent ? `${nextEvent.title} · ${fmtDateLong(nextEvent.start_datetime)}` : 'No hay próximos eventos'
  const nextEventTime = nextEvent ? eventTimeLabel(nextEvent) : 'Sin próximos eventos'

  if (loading) {
    return (
      <LoadingState
        eyebrow="Agenda"
        title="Estamos preparando la agenda"
        subtitle="Recuperamos eventos, conexiones externas y el rango visible del calendario para que la experiencia cargue como parte del workspace."
        messages={['Cargando eventos...', 'Verificando integraciones...', 'Armando la vista de agenda...']}
      />
    )
  }

  return (
    <div className="agenda-page">
      <section className="agenda-hero">
        <div className="agenda-hero__copy">
          <span className="page-eyebrow">Agenda</span>
          <h1>Agenda</h1>
          <p>Coordiná visitas, hitos y vencimientos en una vista más clara para {branding.app_name || 'tu workspace'}, sin salir del flujo operativo del equipo.</p>

          <div className="agenda-hero__actions">
            <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              + Nuevo evento
            </button>
            {anyAvailable ? (
              <button type="button" className="btn btn-secondary" onClick={() => setShowIntegrations((current) => !current)}>
                {showIntegrations ? 'Ocultar integraciones' : 'Ver integraciones'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="agenda-hero__aside">
          <div className="agenda-hero-note">
            <span className="home-panel__eyebrow home-panel__eyebrow--light">Próximo bloque</span>
            <strong>{nextEvent ? nextEvent.title : 'Sin próximos eventos'}</strong>
            <p>{nextEvent ? `${fmtDateTimeLong(nextEvent.start_datetime)} · ${eventTimeLabel(nextEvent)}` : 'Creá un evento para empezar a coordinar el calendario del equipo.'}</p>
          </div>

          <div className="agenda-hero-note agenda-hero-note--soft">
            <span className="home-panel__eyebrow home-panel__eyebrow--light">Lectura rápida</span>
            <p>{activeViewLabel} con {events.length} evento{events.length === 1 ? '' : 's'} en el rango visible y {connectedCount} integraci{connectedCount === 1 ? 'ón activa' : 'ones activas'}.</p>
          </div>
        </div>
      </section>

      <section className="agenda-summary-grid">
        <AgendaStat
          label="Eventos visibles"
          value={events.length}
          note={viewMode === 'week' ? 'Semana actual en pantalla' : 'Rango cargado en agenda'}
          accent="blue"
        />
        <AgendaStat
          label="Próximo evento"
          value={nextEvent ? fmtTimeDisplay(nextEvent.start_datetime) : '—'}
          note={nextEventLabel}
          accent="gold"
        />
        <AgendaStat
          label="Vista activa"
          value={viewMode === 'month' ? 'Mes' : viewMode === 'week' ? 'Semana' : 'Lista'}
          note={periodLabel}
          accent="violet"
        />
        <AgendaStat
          label="Integraciones"
          value={connectedCount}
          note={connectedCount ? 'Calendarios conectados' : 'Sin proveedores activos'}
          accent="green"
        />
      </section>

      {error ? (
        <InlineNotice
          tone="error"
          title="No pudimos cargar la agenda"
          description={error}
          className="agenda-page__notice"
        />
      ) : null}

      {connectedProvider ? (
        <InlineNotice
          tone="success"
          title="Integración conectada"
          description={connectedProvider === 'google'
            ? 'Google Calendar quedó conectado correctamente y ya podés sincronizar desde esta vista.'
            : 'La integración quedó activa correctamente.'}
          className="agenda-page__notice"
        />
      ) : null}

      {modalError ? (
        <InlineNotice
          tone="error"
          title="No pudimos guardar el evento"
          description={modalError}
          className="agenda-page__notice"
        />
      ) : null}

      <div className="agenda-layout">
        <aside className="agenda-sidebar">
          <section className="agenda-side-card">
            <div className="agenda-side-card__header">
              <span className="home-panel__eyebrow">Contexto</span>
              <strong>Ventana visible</strong>
              <p>{periodLabel}</p>
            </div>

            <div className="agenda-side-card__body">
              <div className="agenda-upcoming-card">
                <span>Próximo bloque</span>
                <strong>{nextEventTime}</strong>
                <p>{nextEventLabel}</p>
              </div>

              <div className="agenda-side-list">
                <div>
                  <span>Vista</span>
                  <strong>{activeViewLabel}</strong>
                </div>
                <div>
                  <span>Rango</span>
                  <strong>{events.length} evento{events.length === 1 ? '' : 's'}</strong>
                </div>
                <div>
                  <span>Workspace</span>
                  <strong>{branding.app_name || 'ACM Real Estate'}</strong>
                </div>
              </div>
            </div>
          </section>

          {showIntegrations ? (
            <IntegrationsPanel integrations={integrations} available={available} onRefresh={reloadIntegrations} />
          ) : null}
        </aside>

        <section className="agenda-main home-panel">
          <div className="agenda-main__header">
            <div className="agenda-main__heading">
              <span className="home-panel__eyebrow">Calendario operativo</span>
              <strong>{periodLabel}</strong>
              <p>Hacé click en un día para crear un evento o seleccioná uno existente para editarlo.</p>
            </div>

            <div className="agenda-main__toolbar">
              <div className="agenda-controls">
                <div className="agenda-controls__nav">
                  <button type="button" className="agenda-nav-btn" onClick={viewMode === 'week' ? prevWeek : prevMonth}>‹</button>
                  <button type="button" className="agenda-today-btn" onClick={goToToday}>Hoy</button>
                  <button type="button" className="agenda-nav-btn" onClick={viewMode === 'week' ? nextWeek : nextMonth}>›</button>
                </div>

                <div className="agenda-period-badge">{periodLabel}</div>
              </div>

              <div className="agenda-view-switcher">
                {[
                  { key: 'month', label: 'Mes' },
                  { key: 'week', label: 'Semana' },
                  { key: 'list', label: 'Lista' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`agenda-view-btn${viewMode === option.key ? ' is-active' : ''}`}
                    onClick={() => setViewMode(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="agenda-calendar-container">
            {!events.length ? <AgendaEmptyState onCreate={() => setModal({ mode: 'create' })} /> : null}

            {viewMode === 'month' ? (
              <MonthGrid
                year={currentYear}
                month={currentMonth}
                events={events}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
              />
            ) : null}

            {viewMode === 'week' ? (
              <WeekView
                weekStart={weekStartDate}
                events={events}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
              />
            ) : null}

            {viewMode === 'list' ? (
              events.length ? <ListView events={events} onEventClick={handleEventClick} /> : null
            ) : null}
          </div>
        </section>
      </div>

      {modal ? (
        <EventModal
          mode={modal.mode}
          event={modal.event || modal.defaults}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
          saving={saving}
          deleting={deleting}
        />
      ) : null}
    </div>
  )
}
