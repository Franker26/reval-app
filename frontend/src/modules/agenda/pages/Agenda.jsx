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
} from '../../../api.js'
import InlineNotice from '../../../components/InlineNotice.jsx'
import { LoadingState } from '../../../components/StatusState.jsx'
import { getCachedBrandingPayload } from '../../../theme.js'
import AgendaEmptyState from '../components/AgendaEmptyState.jsx'
import EventModal from '../components/EventModal.jsx'
import IntegrationsPanel from '../components/IntegrationsPanel.jsx'
import ListView from '../components/ListView.jsx'
import MiniMonthSidebar from '../components/MiniMonthSidebar.jsx'
import MonthGrid from '../components/MonthGrid.jsx'
import WeekView from '../components/WeekView.jsx'
import {
  MONTHS_ES,
  buildDefaultWindow,
  endOfMonth,
  eventTimeLabel,
  startOfMonth,
  startOfWeek,
  upcomingEvent,
} from '../components/agendaUtils.js'

function endOfWeek(date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
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

export default function Agenda() {
  const [searchParams] = useSearchParams()
  const today = new Date()
  const branding = getCachedBrandingPayload()

  const [viewMode, setViewMode] = useState('week')
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

  const [connectedProvider, setConnectedProvider] = useState(null)

  useEffect(() => {
    const provider = searchParams.get('connected')
    if (provider) {
      setConnectedProvider(provider)
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

  function handleMiniMonthSelect(date) {
    syncMonthFromDate(date)
    setWeekStartDate(startOfWeek(date))
    setViewMode('week')
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
  const showIntegrationsPanel = Boolean(available?.google || connectedCount || connectedProvider)

  const periodLabel = viewMode === 'week'
    ? `${visibleRange.from.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${visibleRange.to.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${MONTHS_ES[currentMonth]} ${currentYear}`
  const activeViewLabel = viewMode === 'month' ? 'Vista mensual' : viewMode === 'week' ? 'Vista semanal' : 'Vista en lista'
  const syncStatusLabel = connectedCount
    ? `${connectedCount} integraci${connectedCount === 1 ? 'ón activa' : 'ones activas'}`
    : 'Sin sincronizaciones activas'

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
          </div>
        </div>

        <div className="agenda-hero__aside">
          <div className="agenda-hero-note">
            <span className="home-panel__eyebrow home-panel__eyebrow--light">Próximo bloque</span>
            <strong>{nextEvent ? nextEvent.title : 'Sin próximos eventos'}</strong>
            <p>{nextEvent ? `${fmtDateTimeLong(nextEvent.start_datetime)} · ${eventTimeLabel(nextEvent)}` : 'Creá un evento para empezar a coordinar el calendario del equipo.'}</p>
          </div>

          <div className="agenda-hero-note agenda-hero-note--soft">
            <span className="home-panel__eyebrow home-panel__eyebrow--light">Operación</span>
            <p>{activeViewLabel} con {events.length} evento{events.length === 1 ? '' : 's'} en pantalla, período {periodLabel.toLowerCase()} y {syncStatusLabel.toLowerCase()}.</p>
          </div>
        </div>
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
                  { key: 'week', label: 'Semana' },
                  { key: 'month', label: 'Mes' },
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

          <div className="agenda-teams-shell">
            <MiniMonthSidebar
              year={currentYear}
              month={currentMonth}
              selectedDate={weekStartDate}
              onSelectDate={handleMiniMonthSelect}
              branding={branding}
              events={events}
              integrations={integrations}
            />

            <div className="agenda-calendar-container agenda-calendar-container--teams">
              {viewMode === 'week' ? (
                <WeekView
                  weekStart={weekStartDate}
                  events={events}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                />
              ) : null}

              {viewMode === 'month' ? (
                <MonthGrid
                  year={currentYear}
                  month={currentMonth}
                  events={events}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                />
              ) : null}

              {viewMode === 'list' ? (
                events.length ? <ListView events={events} onEventClick={handleEventClick} /> : null
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {showIntegrationsPanel ? (
        <div className="agenda-integrations-section">
          <IntegrationsPanel integrations={integrations} available={available} onRefresh={reloadIntegrations} />
        </div>
      ) : null}

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
