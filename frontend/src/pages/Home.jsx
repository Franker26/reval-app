import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteACM, listACMs, listEvents, listPendingApprovals, updateACM } from '../api.js'
import { useAuth, useConfirm, useWizard } from '../App.jsx'
import { LoadingState, MobileWorkspaceLoading, StateCard } from '../components/StatusState.jsx'

const COLUMNS = [
  { key: 'nuevo', title: 'Nuevo', tone: 'blue' },
  { key: 'en_progreso', title: 'En progreso', tone: 'violet' },
  { key: 'finalizado', title: 'Finalizado', tone: 'green' },
  { key: 'cancelado', title: 'Cancelado', tone: 'slate' },
]

function initials(name = '') {
  return name.slice(0, 2).toUpperCase() || 'AC'
}

function avatarColor(seed = '') {
  let hash = 0
  for (const char of seed) hash = char.charCodeAt(0) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 46%)`
}

function statusLabel(acm) {
  if (!acm.requires_approval) return 'Sin aprobación'
  return acm.approval_status || 'Pendiente'
}

function statusMeta(acm) {
  const label = statusLabel(acm)
  const normalized = String(label).toLowerCase()
  if (normalized.includes('cambio')) {
    return { label, tone: 'danger', hint: 'Requiere cambios antes de poder aprobarse.', dotLabel: 'Cambios solicitados' }
  }
  if (normalized.includes('aprob')) {
    return { label, tone: 'success', hint: 'Tasacion aprobada y lista para continuar o exportar.', dotLabel: 'Aprobada' }
  }
  if (normalized.includes('pendiente')) {
    return { label, tone: 'warning', hint: 'Pendiente de revision y aprobacion.', dotLabel: 'Pendiente' }
  }
  return { label, tone: 'neutral', hint: 'Esta tasacion no requiere aprobacion.', dotLabel: 'Sin aprobacion' }
}

function stageProgress(acm) {
  const order = ['nuevo', 'en_progreso', 'finalizado', 'cancelado']
  const index = order.indexOf(acm.stage || 'nuevo')
  if (index <= 0) return 'Paso inicial'
  if (index === 1) return 'Carga y ajuste en curso'
  if (index === 2) return 'Lista para exportar'
  return 'Flujo detenido'
}

function comparablesLabel(acm) {
  const count = acm.cantidad_comparables || 0
  return `${count} comparable${count === 1 ? '' : 's'}`
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-AR')
}

function formatEventDate(value) {
  return new Date(value).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatEventTime(value, allDay) {
  if (allDay) return 'Todo el día'
  return new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

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
  const { dispatch } = useWizard()
  const { user, logout } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()

  useEffect(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const fetches = [
      listACMs().then(setAcms).catch((e) => setError(e.message)),
      listEvents(now.toISOString(), nextWeek.toISOString()).then(setEvents).catch(() => {}),
    ]
    if (user?.is_approver) {
      fetches.push(listPendingApprovals().then(setPendingApprovals).catch(() => {}))
    }
    Promise.all(fetches).finally(() => setLoading(false))
  }, [user?.is_approver])

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
            <div className="dashboard-header">
              <div>
                <span className="home-panel__eyebrow">Dashboard</span>
                <h1 className="dashboard-greeting">{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleNew}>
                + Nueva tasación
              </button>
            </div>

            <div className="dashboard-grid">
              {/* Island 1: KPIs by stage */}
              <section className="dashboard-island dashboard-island--kpis">
                <div className="dashboard-island__header">
                  <span className="home-panel__eyebrow">Tasaciones</span>
                  <strong>Estado del pipeline</strong>
                </div>
                <div className="dashboard-kpi-grid">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      className={`dashboard-kpi-card dashboard-kpi-card--${col.tone}`}
                      onClick={() => navigate('/pipeline')}
                    >
                      <span className="dashboard-kpi-card__value">{stageCounts[col.key]}</span>
                      <span className="dashboard-kpi-card__label">{col.title}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Island 2: Upcoming agenda events */}
              <section className="dashboard-island">
                <div className="dashboard-island__header">
                  <div>
                    <span className="home-panel__eyebrow">Agenda</span>
                    <strong>Próximos eventos</strong>
                  </div>
                  <button type="button" className="dashboard-link-btn" onClick={() => navigate('/agenda')}>
                    Ver todo →
                  </button>
                </div>
                {upcomingEvents.length > 0 ? (
                  <div className="dashboard-event-list">
                    {upcomingEvents.map((event) => (
                      <div key={event.id} className="dashboard-event-row">
                        <span className="dashboard-event-dot" style={{ background: event.color || 'var(--primary)' }} />
                        <div className="dashboard-event-info">
                          <strong>{event.title}</strong>
                          <span>{formatEventDate(event.start_datetime)} · {formatEventTime(event.start_datetime, event.all_day)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-empty">
                    <span>No hay eventos en los próximos 7 días.</span>
                    <button type="button" className="dashboard-link-btn" onClick={() => navigate('/agenda')}>
                      Ir a la agenda
                    </button>
                  </div>
                )}
              </section>

              {/* Island 3: Pending approvals (approver only) */}
              {user?.is_approver && (
                <section className="dashboard-island">
                  <div className="dashboard-island__header">
                    <div>
                      <span className="home-panel__eyebrow">Revisiones</span>
                      <strong>Aprobaciones pendientes</strong>
                    </div>
                    <button type="button" className="dashboard-link-btn" onClick={() => navigate('/approvals')}>
                      Ver todo →
                    </button>
                  </div>
                  {pendingApprovals.length > 0 ? (
                    <div className="dashboard-approval-list">
                      {pendingApprovals.slice(0, 3).map((acm) => (
                        <button
                          key={acm.id}
                          type="button"
                          className="dashboard-approval-row"
                          onClick={() => navigate('/approvals')}
                        >
                          <div className="dashboard-approval-row__info">
                            <strong>{acm.nombre}</strong>
                            <span>{acm.owner_username || 'Sin asignar'} · {acm.cantidad_comparables || 0} comparables</span>
                          </div>
                          <span className="kanban-card__status kanban-card__status--warning">Pendiente</span>
                        </button>
                      ))}
                      {pendingApprovals.length > 3 && (
                        <button type="button" className="dashboard-link-btn dashboard-link-btn--more" onClick={() => navigate('/approvals')}>
                          +{pendingApprovals.length - 3} más pendientes
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="dashboard-empty">
                      <span>No hay aprobaciones pendientes.</span>
                    </div>
                  )}
                </section>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
