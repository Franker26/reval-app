import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createEvent,
  createIcalFeed,
  deleteEvent,
  deleteIcalFeed,
  disconnectGoogle,
  disconnectMicrosoft,
  getAvailableIntegrations,
  getGoogleAuthUrl,
  getMicrosoftAuthUrl,
  listEvents,
  listIntegrations,
  syncGoogle,
  syncMicrosoft,
  updateEvent,
} from '../api.js'
import { LoadingState, StateCard } from '../components/StatusState.jsx'

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function startOfMonth(year, month) {
  return new Date(year, month, 1)
}

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

function fmtDateInput(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtTimeDisplay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

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

function defaultColor() { return EVENT_COLORS[0].value }

function emptyForm(defaults = {}) {
  const now = new Date()
  const plus1h = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    title: '',
    description: '',
    location: '',
    start_datetime: fmtDateInput(defaults.start || now),
    end_datetime: fmtDateInput(defaults.end || plus1h),
    all_day: false,
    color: defaultColor(),
    recurrence_rule: '',
    ...defaults,
  }
}

// ── Event Modal ────────────────────────────────────────────────────────────

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
        recurrence_rule: event.recurrence_rule || '',
      }
    }
    return emptyForm(event)
  })

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave({
      ...form,
      start_datetime: new Date(form.start_datetime).toISOString(),
      end_datetime: new Date(form.end_datetime).toISOString(),
    })
  }

  return (
    <div className="agenda-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agenda-modal" role="dialog" aria-modal="true">
        <div className="agenda-modal__header">
          <h2>{mode === 'edit' ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button type="button" className="agenda-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form className="agenda-modal__body" onSubmit={handleSubmit}>
          <div className="agenda-field">
            <label>Título *</label>
            <input
              className="agenda-input"
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="Nombre del evento"
              required
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

          <label className="agenda-checkbox-label">
            <input type="checkbox" checked={form.all_day} onChange={set('all_day')} />
            Todo el día
          </label>

          <div className="agenda-field">
            <label>Ubicación</label>
            <input
              className="agenda-input"
              type="text"
              value={form.location}
              onChange={set('location')}
              placeholder="Dirección o enlace de reunión"
            />
          </div>

          <div className="agenda-field">
            <label>Descripción</label>
            <textarea
              className="agenda-input agenda-textarea"
              rows={3}
              value={form.description}
              onChange={set('description')}
              placeholder="Notas o detalle del evento"
            />
          </div>

          <div className="agenda-field">
            <label>Color</label>
            <div className="agenda-color-picker">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`agenda-color-swatch${form.color === c.value ? ' is-selected' : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => setForm((f) => ({ ...f, color: c.value }))}
                />
              ))}
            </div>
          </div>

          <div className="agenda-modal__footer">
            {mode === 'edit' && (
              <button
                type="button"
                className="btn btn-secondary agenda-btn-delete"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? 'Borrando...' : 'Eliminar'}
              </button>
            )}
            <div className="agenda-modal__footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.title.trim()}>
                {saving ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Integrations Panel ─────────────────────────────────────────────────────

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

  async function handleMicrosoftConnect() {
    await act('microsoft-connect', async () => {
      const data = await getMicrosoftAuthUrl()
      window.location.href = data.url
    })
  }

  async function handleGoogleSync() {
    const result = await act('google-sync', syncGoogle)
    if (result) setSyncResult(`Google: ${result.pushed} enviados, ${result.pulled} importados`)
  }

  async function handleMicrosoftSync() {
    const result = await act('microsoft-sync', syncMicrosoft)
    if (result) setSyncResult(`Microsoft: ${result.pushed} enviados, ${result.pulled} importados`)
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

  async function handleMicrosoftDisconnect() {
    await act('microsoft-disconnect', disconnectMicrosoft)
  }

  const googleConnected = Boolean(integrations?.google?.connected)
  const microsoftConnected = Boolean(integrations?.microsoft?.connected)
  const icalConnected = Boolean(integrations?.ical?.connected)
  const icalToken = integrations?.ical?.token
  const icalFeedUrl = icalToken ? `${API_BASE}/api/agenda/ical/${icalToken}` : null

  return (
    <div className="agenda-integrations">
      <div className="agenda-integrations__header">
        <span className="page-eyebrow">Sincronización</span>
        <h3>Calendarios externos</h3>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {syncResult && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{syncResult}</div>}

      <div className="agenda-integrations__list">
        {/* Google Calendar — solo si la empresa lo tiene configurado */}
        {(available?.google || googleConnected) && (
          <div className="agenda-integration-card">
            <div className="agenda-integration-card__icon agenda-integration-card__icon--google">G</div>
            <div className="agenda-integration-card__body">
              <strong>Google Calendar</strong>
              <span>{googleConnected ? 'Conectado — tu cuenta de Google sincronizada' : 'No conectado'}</span>
            </div>
            <div className="agenda-integration-card__actions">
              {googleConnected ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleGoogleSync}
                    disabled={Boolean(loadingAction)}
                  >
                    {loadingAction === 'google-sync' ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleGoogleDisconnect}
                    disabled={Boolean(loadingAction)}
                  >
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleGoogleConnect}
                  disabled={Boolean(loadingAction)}
                >
                  {loadingAction === 'google-connect' ? 'Redirigiendo...' : 'Conectar con Google'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Microsoft Calendar — solo si la empresa lo tiene configurado */}
        {(available?.microsoft || microsoftConnected) && (
          <div className="agenda-integration-card">
            <div className="agenda-integration-card__icon agenda-integration-card__icon--microsoft">M</div>
            <div className="agenda-integration-card__body">
              <strong>Microsoft / Outlook</strong>
              <span>{microsoftConnected ? 'Conectado — tu cuenta de Microsoft sincronizada' : 'No conectado'}</span>
            </div>
            <div className="agenda-integration-card__actions">
              {microsoftConnected ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleMicrosoftSync}
                    disabled={Boolean(loadingAction)}
                  >
                    {loadingAction === 'microsoft-sync' ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleMicrosoftDisconnect}
                    disabled={Boolean(loadingAction)}
                  >
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleMicrosoftConnect}
                  disabled={Boolean(loadingAction)}
                >
                  {loadingAction === 'microsoft-connect' ? 'Redirigiendo...' : 'Conectar con Microsoft'}
                </button>
              )}
            </div>
          </div>
        )}

        {!available?.google && !available?.microsoft && !googleConnected && !microsoftConnected && (
          <p className="admin-muted" style={{ fontSize: '0.8125rem', padding: '0.25rem 0' }}>
            El administrador no tiene configuradas integraciones de calendario para esta empresa.
          </p>
        )}

        {/* Apple iCal */}
        <div className="agenda-integration-card">
          <div className="agenda-integration-card__icon agenda-integration-card__icon--apple">A</div>
          <div className="agenda-integration-card__body">
            <strong>Apple Calendar</strong>
            <span>{icalConnected ? 'Feed activo' : 'Sin feed'}</span>
            {icalFeedUrl && (
              <a
                href={`webcal://${icalFeedUrl.replace(/^https?:\/\//, '')}`}
                className="agenda-ical-link"
                title="Suscribirse en Apple Calendar"
              >
                Suscribirse
              </a>
            )}
          </div>
          <div className="agenda-integration-card__actions">
            {icalConnected ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { navigator.clipboard.writeText(icalFeedUrl) }}
                >
                  Copiar URL
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleIcalDelete}
                  disabled={Boolean(loadingAction)}
                >
                  Revocar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleIcalCreate}
                disabled={Boolean(loadingAction)}
              >
                {loadingAction === 'ical-create' ? 'Generando...' : 'Generar feed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Month Grid ─────────────────────────────────────────────────────────────

function MonthGrid({ year, month, events, onDayClick, onEventClick }) {
  const firstDay = startOfMonth(year, month)
  const totalDays = daysInMonth(year, month)
  const startWeekday = firstDay.getDay() // 0 = Sunday

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const today = new Date()

  function eventsForDay(day) {
    const target = new Date(year, month, day)
    return events.filter((e) => {
      const start = new Date(e.start_datetime)
      const end = new Date(e.end_datetime)
      return start <= target && end >= new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59)
        || isSameDay(start, target)
    })
  }

  return (
    <div className="agenda-month-grid">
      <div className="agenda-month-header-row">
        {DAYS_ES.map((d) => (
          <div key={d} className="agenda-month-header-cell">{d}</div>
        ))}
      </div>
      <div className="agenda-month-cells">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="agenda-month-cell agenda-month-cell--empty" />
          const date = new Date(year, month, day)
          const isToday = isSameDay(date, today)
          const dayEvents = eventsForDay(day)
          return (
            <div
              key={day}
              className={`agenda-month-cell${isToday ? ' agenda-month-cell--today' : ''}`}
              onClick={() => onDayClick(date)}
            >
              <span className="agenda-month-cell__day">{day}</span>
              <div className="agenda-month-cell__events">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="agenda-event-pill"
                    style={{ background: e.color || defaultColor() }}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}
                    title={e.title}
                  >
                    {!e.all_day && <span className="agenda-event-pill__time">{fmtTimeDisplay(e.start_datetime)}</span>}
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="agenda-event-pill--more">+{dayEvents.length - 3} más</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ──────────────────────────────────────────────────────────────

function WeekView({ weekStart, events, onDayClick, onEventClick }) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  function eventsForDay(date) {
    return events.filter((e) => isSameDay(new Date(e.start_datetime), date))
  }

  return (
    <div className="agenda-week-grid">
      {days.map((date) => {
        const isToday = isSameDay(date, today)
        const dayEvents = eventsForDay(date)
        return (
          <div
            key={date.toISOString()}
            className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}`}
            onClick={() => onDayClick(date)}
          >
            <div className="agenda-week-col__header">
              <span className="agenda-week-col__day-name">{DAYS_ES[date.getDay()]}</span>
              <span className={`agenda-week-col__day-num${isToday ? ' is-today' : ''}`}>{date.getDate()}</span>
            </div>
            <div className="agenda-week-col__events">
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="agenda-week-event"
                  style={{ borderLeftColor: e.color || defaultColor() }}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}
                >
                  <span className="agenda-week-event__time">{fmtTimeDisplay(e.start_datetime)}</span>
                  <span className="agenda-week-event__title">{e.title}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── List View ──────────────────────────────────────────────────────────────

function ListView({ events, onEventClick }) {
  const grouped = useMemo(() => {
    const map = new Map()
    const sorted = [...events].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
    for (const e of sorted) {
      const key = new Date(e.start_datetime).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(e)
    }
    return map
  }, [events])

  if (events.length === 0) {
    return (
      <StateCard
        eyebrow="Sin eventos"
        title="No hay eventos en este período"
        description="Hacé click en un día del calendario o en el botón + Nuevo evento para agregar el primero."
        tone="empty"
        mode="inline"
      />
    )
  }

  return (
    <div className="agenda-list-view">
      {Array.from(grouped.entries()).map(([day, dayEvents]) => (
        <div key={day} className="agenda-list-group">
          <div className="agenda-list-group__header">{day}</div>
          {dayEvents.map((e) => (
            <button
              key={e.id}
              type="button"
              className="agenda-list-item"
              onClick={() => onEventClick(e)}
            >
              <span className="agenda-list-item__color" style={{ background: e.color || defaultColor() }} />
              <div className="agenda-list-item__body">
                <strong>{e.title}</strong>
                {e.location && <span className="agenda-list-item__location">{e.location}</span>}
              </div>
              <div className="agenda-list-item__time">
                {e.all_day ? 'Todo el día' : `${fmtTimeDisplay(e.start_datetime)} – ${fmtTimeDisplay(e.end_datetime)}`}
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Agenda() {
  const [searchParams] = useSearchParams()

  const today = new Date()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week' | 'list'
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - d.getDay())
    return d
  })

  const [events, setEvents] = useState([])
  const [integrations, setIntegrations] = useState({})
  const [available, setAvailable] = useState({ google: false, microsoft: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modal, setModal] = useState(null) // { mode: 'create'|'edit', event?: {...}, defaults?: {...} }
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showIntegrations, setShowIntegrations] = useState(false)
  const [connectedProvider, setConnectedProvider] = useState(null)

  useEffect(() => {
    const provider = searchParams.get('connected')
    if (provider) {
      setConnectedProvider(provider)
      setShowIntegrations(true)
    }
  }, [])

  async function loadEvents() {
    try {
      const from = new Date(currentYear, currentMonth, 1).toISOString()
      const to = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString()
      const data = await listEvents(from, to)
      setEvents(data)
    } catch (e) {
      setError(e.message)
    }
  }

  async function loadIntegrations() {
    try {
      const [data, avail] = await Promise.all([listIntegrations(), getAvailableIntegrations()])
      setIntegrations(data)
      setAvailable(avail)
    } catch {
      // integrations are optional
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([loadEvents(), loadIntegrations()])
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentYear, currentMonth])

  function prevMonth() {
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11) }
    else setCurrentMonth((m) => m - 1)
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0) }
    else setCurrentMonth((m) => m + 1)
  }

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  function goToToday() {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
    const d = new Date(now)
    d.setDate(d.getDate() - d.getDay())
    setWeekStart(d)
  }

  function handleDayClick(date) {
    const end = new Date(date.getTime() + 60 * 60 * 1000)
    setModal({
      mode: 'create',
      defaults: { start: date, end },
    })
  }

  function handleEventClick(event) {
    setModal({ mode: 'edit', event })
  }

  async function handleSave(formData) {
    setSaving(true)
    try {
      if (modal.mode === 'edit') {
        const updated = await updateEvent(modal.event.id, formData)
        setEvents((prev) => prev.map((e) => e.id === updated.id ? updated : e))
      } else {
        const created = await createEvent(formData)
        setEvents((prev) => [...prev, created])
      }
      setModal(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!modal?.event) return
    setDeleting(true)
    try {
      await deleteEvent(modal.event.id)
      setEvents((prev) => prev.filter((e) => e.id !== modal.event.id))
      setModal(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  function handleIntegrationsRefresh() {
    loadIntegrations()
  }

  const googleConnected = Boolean(integrations?.google?.connected)
  const microsoftConnected = Boolean(integrations?.microsoft?.connected)
  const anyConnected = googleConnected || microsoftConnected || Boolean(integrations?.ical?.connected)
  const anyAvailable = available?.google || available?.microsoft || anyConnected

  const periodLabel = viewMode === 'week'
    ? `${weekStart.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${MONTHS_ES[currentMonth]} ${currentYear}`

  if (loading) {
    return (
      <LoadingState
        eyebrow="Agenda"
        title="Cargando tu agenda"
        subtitle="Recuperamos tus eventos y el estado de las integraciones."
        messages={['Cargando eventos...', 'Verificando integraciones...', 'Preparando calendario...']}
      />
    )
  }

  return (
    <div className="agenda-page">
      {/* Header */}
      <div className="agenda-page__header">
        <div className="agenda-page__header-left">
          <span className="page-eyebrow">Workspace</span>
          <h1>Agenda</h1>
        </div>
        <div className="agenda-page__header-actions">
          {anyAvailable && (
            <button
              type="button"
              className={`btn btn-secondary btn-sm${anyConnected ? ' agenda-sync-badge' : ''}`}
              onClick={() => setShowIntegrations((v) => !v)}
            >
              Integraciones {anyConnected ? '·' : ''}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModal({ mode: 'create' })}
          >
            + Nuevo evento
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {connectedProvider && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {connectedProvider === 'google' ? 'Google Calendar' : 'Microsoft Calendar'} conectado correctamente.
        </div>
      )}

      {/* Integrations Panel */}
      {showIntegrations && (
        <IntegrationsPanel integrations={integrations} available={available} onRefresh={handleIntegrationsRefresh} />
      )}

      {/* Calendar Controls */}
      <div className="agenda-controls">
        <div className="agenda-controls__nav">
          <button type="button" className="agenda-nav-btn" onClick={viewMode === 'week' ? prevWeek : prevMonth}>‹</button>
          <button type="button" className="agenda-today-btn" onClick={goToToday}>Hoy</button>
          <button type="button" className="agenda-nav-btn" onClick={viewMode === 'week' ? nextWeek : nextMonth}>›</button>
          <span className="agenda-period-label">{periodLabel}</span>
        </div>
        <div className="agenda-view-switcher">
          {[
            { key: 'month', label: 'Mes' },
            { key: 'week', label: 'Semana' },
            { key: 'list', label: 'Lista' },
          ].map((v) => (
            <button
              key={v.key}
              type="button"
              className={`agenda-view-btn${viewMode === v.key ? ' is-active' : ''}`}
              onClick={() => setViewMode(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar View */}
      <div className="agenda-calendar-container">
        {viewMode === 'month' && (
          <MonthGrid
            year={currentYear}
            month={currentMonth}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            weekStart={weekStart}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            events={events}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* Event Modal */}
      {modal && (
        <EventModal
          mode={modal.mode}
          event={modal.event || (modal.defaults ? { start_datetime: modal.defaults.start, end_datetime: modal.defaults.end } : undefined)}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
          saving={saving}
          deleting={deleting}
        />
      )}
    </div>
  )
}
