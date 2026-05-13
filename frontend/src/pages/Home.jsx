import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteACM, listACMs, listEvents, listPendingApprovals, updateACM } from '../api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useConfirm } from '../contexts/ConfirmContext.jsx'
import { useWizard } from '../modules/acm-core/contexts/WizardContext.jsx'
import { useModules } from '../framework/useModules.js'
import { LoadingState, MobileWorkspaceLoading, StateCard } from '../components/StatusState.jsx'
import { avatarColor, initials } from '../utils/avatars.js'
import { ACM_STAGES } from '../constants/status.js'
import {
  statusLabel,
  statusMeta,
  stageProgress,
  comparablesLabel,
  greeting,
  formatDate,
  formatEventDate,
  formatEventTime,
  startOfHour,
  isSameDay,
} from './home/helpers.js'
import DashboardPlaceholderStack from './home/DashboardPlaceholderStack.jsx'

const COLUMNS = ACM_STAGES

export default function Home() {
  const [acms, setAcms] = useState([])
  const [events, setEvents] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickDraft, setQuickDraft] = useState({ nombre: '', direccion: '' })
  const [quickErrors, setQuickErrors] = useState({})
  const [routeTransition, setRouteTransition] = useState(null)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 820
  })
  const registry = useModules()
  const hasACM = registry.isInstalled('acm-core')
  const hasAgenda = registry.isInstalled('agenda')
  const hasReviews = registry.isInstalled('acm-reviews')
  const hasAnyModule = hasACM || hasAgenda || hasReviews

  const { dispatch } = useWizard()
  const { user, logout } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()

  useEffect(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const fetches = []
    if (hasACM) fetches.push(listACMs().then(setAcms).catch((e) => setError(e.message)))
    if (hasAgenda) fetches.push(listEvents(now.toISOString(), nextWeek.toISOString()).then(setEvents).catch(() => {}))
    if (hasReviews && user?.is_approver) fetches.push(listPendingApprovals().then(setPendingApprovals).catch(() => {}))
    Promise.all(fetches).finally(() => setLoading(false))
  }, [hasACM, hasAgenda, hasReviews, user?.is_approver])

  useEffect(() => {
    function handleResize() { setIsMobile(window.innerWidth <= 820) }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const grouped = useMemo(() => {
    const base = Object.fromEntries(COLUMNS.map((col) => [col.key, []]))
    for (const acm of acms) {
      const key = acm.stage || 'nuevo'
      if (!base[key]) base[key] = []
      base[key].push(acm)
    }
    return base
  }, [acms])

  const stageCounts = useMemo(() => ({
    nuevo: grouped.nuevo?.length || 0,
    en_progreso: grouped.en_progreso?.length || 0,
    finalizado: grouped.finalizado?.length || 0,
    cancelado: grouped.cancelado?.length || 0,
  }), [grouped])

  const recentAcms = useMemo(() => {
    return [...acms].sort((a, b) => new Date(b.updated_at || b.fecha_creacion) - new Date(a.updated_at || a.fecha_creacion))
  }, [acms])

  const spotlightAcms = useMemo(() => {
    return recentAcms.filter((item) => (item.stage || 'nuevo') !== 'cancelado').slice(0, 6)
  }, [recentAcms])

  const actionableAcms = useMemo(() => {
    const pending = recentAcms.filter((item) => {
      const approvalPending = String(item.approval_status || '').toLowerCase() === 'pendiente'
      const activeStage = ['nuevo', 'en_progreso'].includes(item.stage || 'nuevo')
      return approvalPending || activeStage
    })
    return (pending.length ? pending : recentAcms).slice(0, 4)
  }, [recentAcms])

  const mobileOverview = useMemo(() => {
    const pendingCount = acms.filter((acm) => String(acm.approval_status || '').toLowerCase() === 'pendiente').length
    return {
      total: acms.length,
      pendingApprovals: pendingCount,
      completed: grouped.finalizado?.length || 0,
      inFlight: (grouped.nuevo?.length || 0) + (grouped.en_progreso?.length || 0),
    }
  }, [acms, grouped])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return [...events]
      .filter((e) => new Date(e.end_datetime || e.start_datetime) >= now)
      .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
      .slice(0, 4)
  }, [events])

  const todayAgenda = useMemo(() => {
    const now = new Date()
    const todayEvents = [...events]
      .filter((event) => isSameDay(new Date(event.start_datetime), now))
      .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
      .slice(0, 4)

    return {
      dateLabel: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekdayLabel: now.toLocaleDateString('es-AR', { weekday: 'long' }),
      countLabel: `${todayEvents.length} evento${todayEvents.length === 1 ? '' : 's'}`,
      events: todayEvents,
    }
  }, [events])

  const todayTimeline = useMemo(() => {
    const now = new Date()
    const timelineStart = startOfHour(new Date(now.getTime() - 2 * 60 * 60 * 1000))
    const slots = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(timelineStart.getTime() + index * 60 * 60 * 1000)
      return {
        key: date.toISOString(),
        label: date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        date,
      }
    })

    const windowEnd = new Date(timelineStart.getTime() + 5 * 60 * 60 * 1000)
    const visibleEvents = todayAgenda.events
      .filter((event) => {
        const start = new Date(event.start_datetime)
        const end = new Date(event.end_datetime || event.start_datetime)
        return end >= timelineStart && start <= windowEnd
      })
      .map((event) => {
        const start = new Date(event.start_datetime)
        const end = new Date(event.end_datetime || event.start_datetime)
        const clampedStart = Math.max(start.getTime(), timelineStart.getTime())
        const clampedEnd = Math.max(Math.min(end.getTime(), windowEnd.getTime()), clampedStart + 15 * 60 * 1000)
        const range = windowEnd.getTime() - timelineStart.getTime()
        return {
          ...event,
          top: ((clampedStart - timelineStart.getTime()) / range) * 100,
          height: Math.max(((clampedEnd - clampedStart) / range) * 100, 8),
        }
      })

    const nowOffset = Math.min(Math.max(((now.getTime() - timelineStart.getTime()) / (windowEnd.getTime() - timelineStart.getTime())) * 100, 0), 100)

    return {
      slots,
      visibleEvents,
      nowOffset,
    }
  }, [todayAgenda.events])

  const desktopOverview = useMemo(() => {
    const inFlight = stageCounts.nuevo + stageCounts.en_progreso
    const approvalQueue = pendingApprovals.length
    const completionRate = acms.length ? Math.round((stageCounts.finalizado / acms.length) * 100) : 0
    return {
      total: acms.length,
      inFlight,
      approvalQueue,
      completionRate,
    }
  }, [acms.length, pendingApprovals.length, stageCounts])

  const secondaryDesktopFeed = useMemo(() => {
    if (user?.is_approver) return pendingApprovals.slice(0, 4)
    return recentAcms.slice(0, 4)
  }, [pendingApprovals, recentAcms, user?.is_approver])

  function handleNew() {
    dispatch({ type: 'RESET' })
    navigate('/acm/tipo')
  }

  function handleQuickDraftChange(key, value) {
    setQuickDraft((prev) => ({ ...prev, [key]: value }))
    setQuickErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function handleQuickCreate() {
    const nextErrors = {}
    if (!quickDraft.nombre.trim()) nextErrors.nombre = 'Requerido'
    if (!quickDraft.direccion.trim()) nextErrors.direccion = 'Requerido'
    if (Object.keys(nextErrors).length) { setQuickErrors(nextErrors); return }
    dispatch({ type: 'RESET' })
    setQuickCreateOpen(false)
    navigate('/acm/new', {
      state: {
        tipo: 'Departamento',
        quickDraft: { nombre: quickDraft.nombre.trim(), direccion: quickDraft.direccion.trim() },
      },
    })
  }

  function handleMobileNavigate(path) {
    setMobileDrawerOpen(false)
    const isDashboardSwap = path === '/approvals' || path === '/'
    if (isDashboardSwap) {
      setRouteTransition(path === '/approvals' ? 'approvals' : 'dashboard')
      window.setTimeout(() => navigate(path), 140)
      return
    }
    navigate(path)
  }

  function handleMobileLogout() {
    setMobileDrawerOpen(false)
    logout()
    navigate('/login')
  }

  async function handleDelete(id, nombre) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar tasación',
      title: `Se va a eliminar "${nombre}"`,
      description: 'Esta acción quitará la tasación del tablero. Si querés conservar el historial, podés moverla a Cancelado.',
      confirmLabel: 'Eliminar tasación',
      cancelLabel: 'Mantener tasación',
    })
    if (!accepted) return
    try {
      await deleteACM(id)
      setAcms((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  function handleOpen(acm) {
    dispatch({ type: 'SET_ACM_ID', payload: acm.id })
    const nextStep = acm.cantidad_comparables > 0 ? 2 : 1
    navigate(`/acm/${acm.id}/step/${nextStep}`)
  }

  if (isMobile && routeTransition) {
    return (
      <MobileWorkspaceLoading
        eyebrow="Cambiando de vista"
        title={routeTransition === 'approvals' ? 'Abriendo aprobaciones' : 'Volviendo al dashboard'}
        subtitle={routeTransition === 'approvals'
          ? 'Preparamos la cola rápida con las tasaciones pendientes para revisar desde el celular.'
          : 'Estamos restaurando el tablero operativo con tus ACMs, métricas y accesos rápidos.'}
        messages={routeTransition === 'approvals'
          ? ['Entrando a aprobaciones...', 'Buscando tasaciones pendientes...', 'Preparando revisión rápida...']
          : ['Volviendo al dashboard...', 'Sincronizando tasaciones...', 'Ordenando el tablero móvil...']}
        metrics={routeTransition === 'approvals'
          ? [
              { label: 'Pendientes', value: mobileOverview.pendingApprovals },
              { label: 'Activos', value: mobileOverview.inFlight },
              { label: 'Workspace', value: 'Mobile' },
            ]
          : [
              { label: 'Activos', value: mobileOverview.inFlight },
              { label: 'Pendientes', value: mobileOverview.pendingApprovals },
              { label: 'Finalizados', value: mobileOverview.completed },
            ]}
      />
    )
  }

  return (
    <div>
      {loading && (
        isMobile ? (
          <MobileWorkspaceLoading
            eyebrow="Carga de panel"
            title="Estamos preparando el dashboard"
            subtitle="Sincronizamos tasaciones, métricas y etapas del equipo para que el tablero abra listo en mobile."
            messages={['Cargando tablero...', 'Preparando workspace...', 'Sincronizando datos...']}
            metrics={[
              { label: 'Vista', value: 'Mobile' },
              { label: 'Flujo', value: 'ACMs' },
              { label: 'Estado', value: 'Sync' },
            ]}
          />
        ) : (
          <LoadingState
            eyebrow="Cargando dashboard"
            title="Preparamos el tablero operativo"
            subtitle="Sincronizamos tasaciones, métricas y etapas del equipo."
            messages={['Cargando tablero...', 'Preparando workspace...', 'Sincronizando datos...']}
            step="Dashboard"
          />
        )
      )}

      {error && !loading && (
        <StateCard
          eyebrow="No pudimos cargar el tablero"
          title="El panel no respondió como esperábamos"
          description={error}
          tone="error"
          mode="inline"
          actions={<button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>}
        />
      )}

      {!loading && !error && (
        <>
          {/* ── Mobile shell ─────────────────────────────────────────── */}
          <section className="home-mobile-shell">
            <button
              type="button"
              className={`home-mobile-modal-backdrop${quickCreateOpen ? ' is-open' : ''}`}
              onClick={() => setQuickCreateOpen(false)}
              aria-label="Cerrar alta rápida"
            />

            <div className={`home-mobile-quick-modal${quickCreateOpen ? ' is-open' : ''}`} aria-hidden={!quickCreateOpen}>
              <div className="home-mobile-quick-modal__header">
                <div>
                  <span className="home-mobile-section-label">Tasación rápida</span>
                  <strong>Creá el ACM con lo mínimo</strong>
                </div>
                <button type="button" className="home-mobile-quick-modal__close" onClick={() => setQuickCreateOpen(false)}>×</button>
              </div>
              <div className="home-mobile-quick-modal__body">
                <label className="home-mobile-quick-field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={quickDraft.nombre}
                    onChange={(e) => handleQuickDraftChange('nombre', e.target.value)}
                    placeholder="Ej: Av. Libertador 2450"
                  />
                  {quickErrors.nombre && <small>{quickErrors.nombre}</small>}
                </label>
                <label className="home-mobile-quick-field">
                  <span>Dirección</span>
                  <input
                    type="text"
                    value={quickDraft.direccion}
                    onChange={(e) => handleQuickDraftChange('direccion', e.target.value)}
                    placeholder="Ej: Av. Libertador 2450, CABA"
                  />
                  {quickErrors.direccion && <small>{quickErrors.direccion}</small>}
                </label>
              </div>
              <button type="button" className="btn btn-primary home-mobile-quick-modal__submit" onClick={handleQuickCreate}>
                Continuar con tasación rápida
              </button>
            </div>

            <button
              type="button"
              className={`home-mobile-drawer-backdrop${mobileDrawerOpen ? ' is-open' : ''}`}
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Cerrar panel lateral"
            />

            <aside className={`home-mobile-drawer${mobileDrawerOpen ? ' is-open' : ''}`} aria-hidden={!mobileDrawerOpen}>
              <div className="home-mobile-drawer__header">
                <div className="home-mobile-drawer__identity">
                  <div className="home-mobile-drawer__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                    {initials(user?.username || 'Usuario')}
                  </div>
                  <div>
                    <strong>{user?.username || 'Usuario'}</strong>
                    <span>{user?.is_admin ? 'Administrador' : 'Workspace operativo'}</span>
                  </div>
                </div>
                <button type="button" className="home-mobile-drawer__close" onClick={() => setMobileDrawerOpen(false)}>×</button>
              </div>
              <div className="home-mobile-drawer__actions">
                <button type="button" className="settings-sidebar-item settings-sidebar-item--active" onClick={() => handleMobileNavigate('/settings')}>Configuración</button>
                <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/settings')}>Cambiar contraseña</button>
                {user?.is_approver && (
                  <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/approvals')}>Aprobaciones</button>
                )}
                <button type="button" className="settings-sidebar-item" onClick={handleMobileLogout}>Cerrar sesión</button>
              </div>
            </aside>

            <section className="home-mobile-topband">
              <header className="home-mobile-header">
                <button
                  type="button"
                  className="home-mobile-user-trigger"
                  onClick={() => setMobileDrawerOpen(true)}
                  aria-expanded={mobileDrawerOpen}
                  aria-label="Abrir panel de usuario"
                >
                  <span className="home-mobile-user-trigger__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                    {initials(user?.username || 'Usuario')}
                  </span>
                  <span className="home-mobile-user-trigger__body">
                    <span className="home-mobile-user-trigger__name">{user?.username || 'Usuario'}</span>
                    <span className="home-mobile-user-trigger__meta">Workspace Reval</span>
                  </span>
                </button>
                <div className="home-mobile-header__utilities">
                  {user?.is_approver && (
                    <button type="button" className="home-mobile-utility-pill" onClick={() => handleMobileNavigate('/approvals')}>Aprobaciones</button>
                  )}
                  <button type="button" className="home-mobile-utility-icon" onClick={() => setMobileDrawerOpen(true)} aria-label="Abrir perfil">≡</button>
                </div>
              </header>

              <section className="home-mobile-overview">
                <span className="home-mobile-overview__eyebrow">Resumen operativo</span>
                <h1>{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
                <p>
                  {mobileOverview.total > 0
                    ? `Tenés ${mobileOverview.inFlight} ACM activos y ${mobileOverview.pendingApprovals} pendiente${mobileOverview.pendingApprovals === 1 ? '' : 's'} de aprobación.`
                    : 'Todavía no hay ACMs activos para seguir desde el celular.'}
                </p>
                <div className="home-mobile-overview__metrics">
                  <article className="home-mobile-metric-card">
                    <span>Activos</span>
                    <strong>{mobileOverview.inFlight}</strong>
                  </article>
                  <article className="home-mobile-metric-card">
                    <span>Pendientes</span>
                    <strong>{mobileOverview.pendingApprovals}</strong>
                  </article>
                  <article className="home-mobile-metric-card">
                    <span>Finalizados</span>
                    <strong>{mobileOverview.completed}</strong>
                  </article>
                </div>
              </section>
            </section>

            <section className="home-mobile-carousel-block">
              <div className="home-mobile-block-header">
                <div>
                  <span className="home-mobile-section-label">ACMs</span>
                  <strong>Deslizá y retomá rápido</strong>
                </div>
              </div>
              {spotlightAcms.length > 0 ? (
                <div className="home-mobile-carousel" role="list" aria-label="ACMs recientes">
                  {spotlightAcms.map((acm) => {
                    const status = statusMeta(acm)
                    return (
                      <article key={acm.id} className={`home-mobile-carousel-card home-mobile-carousel-card--${status.tone}`} role="listitem">
                        <div className="home-mobile-carousel-card__top">
                          <span className="home-mobile-carousel-card__stage">{(acm.stage || 'nuevo').replace('_', ' ')}</span>
                          <span className={`kanban-card__status kanban-card__status--${status.tone}`}>{status.label}</span>
                        </div>
                        <div className="home-mobile-carousel-card__body">
                          <strong>{acm.nombre}</strong>
                          <p>{acm.direccion}</p>
                        </div>
                        <div className="home-mobile-carousel-card__stats">
                          <div>
                            <span>Comparables</span>
                            <strong>{acm.cantidad_comparables || 0}</strong>
                          </div>
                          <div>
                            <span>Actualizado</span>
                            <strong>{new Date(acm.updated_at || acm.fecha_creacion).toLocaleDateString('es-AR')}</strong>
                          </div>
                        </div>
                        <button type="button" className="btn btn-primary home-mobile-carousel-card__cta" onClick={() => handleOpen(acm)}>
                          Retomar ACM
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="kanban-empty">No hay ACMs activos para mostrar en el carrusel.</div>
              )}
            </section>

            <section className="home-mobile-queue">
              <div className="home-mobile-block-header">
                <div>
                  <span className="home-mobile-section-label">En foco</span>
                  <strong>Lo más urgente</strong>
                </div>
                <span className="home-mobile-feed__count">{actionableAcms.length} casos</span>
              </div>
              {actionableAcms.map((acm) => {
                const status = statusMeta(acm)
                return (
                  <article
                    key={acm.id}
                    className="home-mobile-list-card"
                    onClick={() => handleOpen(acm)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(acm) } }}
                  >
                    <div className="home-mobile-list-card__main">
                      <div>
                        <div className="kanban-card__title">{acm.nombre}</div>
                        <div className="kanban-card__address">{acm.direccion}</div>
                      </div>
                      <span className={`kanban-card__status kanban-card__status--${status.tone}`}>{status.label}</span>
                    </div>
                    <div className="home-mobile-list-card__meta">
                      <span>{comparablesLabel(acm)}</span>
                      <span>{new Date(acm.updated_at || acm.fecha_creacion).toLocaleDateString('es-AR')}</span>
                    </div>
                    <div className="kanban-card__insights">
                      <span className="kanban-card__chip">{stageProgress(acm)}</span>
                      <span className="kanban-card__chip">{acm.owner_username || 'Sin asignar'}</span>
                    </div>
                  </article>
                )
              })}
              {actionableAcms.length === 0 && (
                <div className="kanban-empty">No hay casos urgentes en este momento.</div>
              )}
            </section>

            <nav className="home-mobile-dock" aria-label="Acciones rápidas">
              <button type="button" className="home-mobile-dock__primary home-mobile-dock__primary--solo" onClick={() => setQuickCreateOpen(true)}>
                + Tasación rápida
              </button>
            </nav>
          </section>

          {/* ── Desktop dashboard ─────────────────────────────────────── */}
          <section className="home-desktop-shell" aria-label="Dashboard">
            {!hasAnyModule ? (
              <div className="home-no-modules">
                <div className="home-no-modules__inner">
                  <span className="home-panel__eyebrow">Workspace</span>
                  <h1 className="dashboard-greeting">{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
                  <p className="home-no-modules__copy">
                    Tu workspace todavía no tiene ninguna aplicación instalada.
                    Instalá módulos desde el App Store para empezar a usar las funciones de la plataforma.
                  </p>
                  {user?.is_admin && (
                    <button type="button" className="btn btn-primary" onClick={() => navigate('/apps')}>
                      Ir al App Store →
                    </button>
                  )}
                </div>
              </div>
            ) : (<>
            <header className="dashboard-hero">
              <div className="dashboard-hero__copy">
                <span className="home-panel__eyebrow">Dashboard</span>
                <h1 className="dashboard-greeting">{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
                <p>
                  {hasACM && desktopOverview.total > 0
                    ? `Tenés ${desktopOverview.inFlight} tasaciones activas, ${stageCounts.finalizado} finalizadas y ${desktopOverview.approvalQueue} en revisión.`
                    : hasACM ? 'Todavía no hay tasaciones cargadas. Podés crear la primera y empezar el flujo desde acá.' : 'Bienvenido a tu workspace.'}
                </p>
              </div>

              <div className="dashboard-hero__actions">
                {hasACM && (
                  <button type="button" className="btn btn-primary" onClick={handleNew}>
                    + Nueva tasación
                  </button>
                )}
                {hasACM && (
                  <button type="button" className="dashboard-secondary-btn" onClick={() => navigate('/pipeline')}>
                    Ver pipeline
                  </button>
                )}
              </div>

              <div className="dashboard-overview-grid">
                <article className="dashboard-overview-card">
                  <span>ACMs activos</span>
                  <strong>{desktopOverview.inFlight}</strong>
                  <small>Nuevo + en progreso</small>
                </article>
                <article className="dashboard-overview-card">
                  <span>Finalizadas</span>
                  <strong>{stageCounts.finalizado}</strong>
                  <small>{desktopOverview.completionRate}% del total</small>
                </article>
                <article className="dashboard-overview-card">
                  <span>Revisión</span>
                  <strong>{desktopOverview.approvalQueue}</strong>
                  <small>{user?.is_approver ? 'Pendientes de aprobar' : 'Esperando respuesta'}</small>
                </article>
              </div>
            </header>
            <div className="dashboard-grid">
              {hasAgenda && <section className="dashboard-calendar-card">
                <div className="dashboard-calendar-card__date">
                  <strong>{todayAgenda.dateLabel}</strong>
                  <span>{todayAgenda.weekdayLabel}</span>
                  <small>{todayAgenda.countLabel}</small>
                </div>
                <div className="dashboard-calendar-card__events">
                  <div className="dashboard-calendar-card__header">
                    <span className="home-panel__eyebrow home-panel__eyebrow--light">Agenda</span>
                    <button type="button" className="dashboard-link-btn dashboard-link-btn--calendar" onClick={() => navigate('/agenda')}>
                      Ver agenda →
                    </button>
                  </div>
                  <div className="dashboard-timeline">
                    <div className="dashboard-timeline__slots" aria-hidden="true">
                      {todayTimeline.slots.map((slot) => (
                        <div key={slot.key} className="dashboard-timeline__slot">
                          <span>{slot.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="dashboard-timeline__track">
                      {todayTimeline.slots.map((slot) => (
                        <div key={slot.key} className="dashboard-timeline__line" />
                      ))}
                      <div className="dashboard-timeline__now" style={{ top: `${todayTimeline.nowOffset}%` }} />
                      {todayTimeline.visibleEvents.map((event) => (
                        <div
                          key={event.id}
                          className="dashboard-timeline__event"
                          style={{
                            top: `${event.top}%`,
                            height: `${event.height}%`,
                            borderColor: event.color || 'rgba(var(--primary-rgb), 0.24)',
                            background: event.color ? `${event.color}18` : 'rgba(var(--primary-rgb), 0.08)',
                          }}
                        >
                          <strong>{event.title}</strong>
                          <span>{formatEventTime(event.start_datetime, event.all_day)}{event.all_day ? '' : ` - ${formatEventTime(event.end_datetime || event.start_datetime, false)}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>}

              <div className="dashboard-grid__split">
                {hasACM && <section className="dashboard-panel dashboard-panel--focus">
                  <div className="dashboard-panel__header">
                    <div>
                      <span className="home-panel__eyebrow">En foco</span>
                      <strong>Casos para retomar hoy</strong>
                    </div>
                    <span className="dashboard-panel__meta">{actionableAcms.length} visibles</span>
                  </div>
                  {actionableAcms.length > 0 ? (
                    <div className="dashboard-focus-list">
                      {actionableAcms.map((acm) => {
                        const status = statusMeta(acm)
                        return (
                          <button key={acm.id} type="button" className="dashboard-focus-card" onClick={() => handleOpen(acm)}>
                            <div className="dashboard-focus-card__top">
                              <div>
                                <strong>{acm.nombre}</strong>
                                <p>{acm.direccion}</p>
                              </div>
                              <span className={`kanban-card__status kanban-card__status--${status.tone}`}>{status.label}</span>
                            </div>
                            <div className="dashboard-focus-card__meta">
                              <span>{stageProgress(acm)}</span>
                              <span>{comparablesLabel(acm)}</span>
                              <span>{formatDate(acm.updated_at || acm.fecha_creacion)}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <DashboardPlaceholderStack variant="focus" />
                  )}
                </section>}

                {(hasACM || (hasReviews && user?.is_approver)) && <section className="dashboard-panel">
                  <div className="dashboard-panel__header">
                    <div>
                      <span className="home-panel__eyebrow">{user?.is_approver && hasReviews ? 'Revisiones' : 'Actividad'}</span>
                      <strong>{user?.is_approver && hasReviews ? 'Cola de aprobaciones' : 'Últimas tasaciones actualizadas'}</strong>
                    </div>
                    <button
                      type="button"
                      className="dashboard-link-btn"
                      onClick={() => navigate(user?.is_approver ? '/approvals' : '/pipeline')}
                    >
                      {user?.is_approver ? 'Ver todo →' : 'Abrir pipeline →'}
                    </button>
                  </div>
                  {secondaryDesktopFeed.length > 0 ? (
                    <div className="dashboard-approval-list">
                      {secondaryDesktopFeed.map((acm) => (
                        <button
                          key={acm.id}
                          type="button"
                          className="dashboard-approval-row"
                          onClick={() => (user?.is_approver ? navigate('/approvals') : handleOpen(acm))}
                        >
                          <div className="dashboard-approval-row__info">
                            <strong>{acm.nombre}</strong>
                            <span>
                              {user?.is_approver
                                ? `${acm.owner_username || 'Sin asignar'} · ${acm.cantidad_comparables || 0} comparables`
                                : `${acm.owner_username || 'Sin asignar'} · ${formatDate(acm.updated_at || acm.fecha_creacion)}`}
                            </span>
                          </div>
                          <span className={`kanban-card__status kanban-card__status--${user?.is_approver ? 'warning' : statusMeta(acm).tone}`}>
                            {user?.is_approver ? 'Pendiente' : statusMeta(acm).label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <DashboardPlaceholderStack variant="review" />
                  )}
                </section>}
              </div>
            </div>
            </>)}
          </section>
        </>
      )}
    </div>
  )
}
