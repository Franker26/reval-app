import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getResultado, listPendingApprovals, reviewACM } from '../api.js'
import { useAuth, useWizard } from '../App.jsx'
import { LoadingState, MobileWorkspaceLoading, StateCard } from '../components/StatusState.jsx'
import { avatarColor, initials } from '../utils/avatars.js'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function fmtUSD(n) {
  return n != null ? `USD ${Math.round(n).toLocaleString('es-AR')}` : '—'
}

function fmtM2(n) {
  return n != null ? `USD ${Math.round(n).toLocaleString('es-AR')}/m²` : '—'
}

function confidenceMeta(cv) {
  if (cv == null) return { label: 'Sin cálculo', short: 'N/D', color: '#64748b', bg: '#f1f5f9', tone: 'neutral' }
  if (cv < 5) return { label: 'Alta confianza', short: 'Alta', color: '#2e7d32', bg: '#e8f5e9', tone: 'success' }
  if (cv < 10) return { label: 'Confianza media', short: 'Media', color: '#e65100', bg: '#fff3e0', tone: 'warning' }
  return { label: 'Baja confianza', short: 'Baja', color: '#c62828', bg: '#ffebee', tone: 'danger' }
}

function normalizeStage(stage = 'nuevo') {
  return String(stage).replace('_', ' ')
}

export default function Approvals() {
  const { user, logout } = useAuth()
  const { dispatch } = useWizard()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectMessage, setRejectMessage] = useState('')
  const [routeTransition, setRouteTransition] = useState(null)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 820
  })
  const [selectedId, setSelectedId] = useState(null)
  const [desktopRejectMessage, setDesktopRejectMessage] = useState('')

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 820)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!user?.is_approver) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const pending = await listPendingApprovals()
        const enriched = await Promise.all(
          pending.map(async (item) => {
            try {
              const result = await getResultado(item.id)
              const cv = result.mean_ajustado > 0 ? (result.std_ajustado / result.mean_ajustado) * 100 : null
              return {
                ...item,
                result,
                avgPriceM2: result.mean_ajustado,
                suggestedPrice: result.valor_estimado_sujeto,
                comparableCount: result.comparables.length || item.cantidad_comparables || 0,
                confidenceCv: cv,
                confidence: confidenceMeta(cv),
              }
            } catch {
              return {
                ...item,
                result: null,
                avgPriceM2: null,
                suggestedPrice: null,
                comparableCount: item.cantidad_comparables || 0,
                confidenceCv: null,
                confidence: confidenceMeta(null),
              }
            }
          }),
        )
        if (!cancelled) {
          setItems(enriched)
          setSelectedId((current) => current || enriched[0]?.id || null)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (!user?.is_approver) {
    return (
      <StateCard
        eyebrow="Acceso restringido"
        title="No tenés permisos para revisar aprobaciones"
        description="Necesitás un perfil aprobador para entrar en esta cola de revisión."
        tone="error"
        actions={<button className="btn btn-primary" onClick={() => navigate('/')}>Volver al tablero</button>}
      />
    )
  }

  function handleMobileNavigate(path) {
    setMobileDrawerOpen(false)
    const isDashboardSwap = isMobile && (path === '/approvals' || path === '/')
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

  function handleOpenResults(item) {
    dispatch({ type: 'SET_ACM_ID', payload: item.id })
    if (item.result) dispatch({ type: 'SET_RESULTADO', payload: item.result })
    navigate(`/acm/${item.id}/step/4`)
  }

  async function handleReview(item, status, commentMessage = '') {
    if (!item) return
    setSavingId(item.id)
    setError(null)
    setMessage(null)
    try {
      await reviewACM(item.id, {
        status,
        comments: commentMessage.trim() ? [{ section: 'general', message: commentMessage.trim() }] : [],
      })
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
      setSelectedId((current) => {
        if (current !== item.id) return current
        const remaining = items.filter((entry) => entry.id !== item.id)
        return remaining[0]?.id || null
      })
      setDesktopRejectMessage('')
      setMessage(status === 'Aprobado'
        ? `"${item.nombre}" quedó aprobada.`
        : `Se solicitaron cambios para "${item.nombre}".`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleApprove(item) {
    await handleReview(item, 'Aprobado')
  }

  async function handleRejectConfirm() {
    if (!rejectTarget) return
    await handleReview(rejectTarget, 'Cambios solicitados', rejectMessage)
    setRejectTarget(null)
    setRejectMessage('')
  }

  const pendingCount = items.length
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])

  if (isMobile && routeTransition) {
    return (
      <MobileWorkspaceLoading
        eyebrow="Cambiando de vista"
        title={routeTransition === 'dashboard' ? 'Volviendo al dashboard' : 'Abriendo aprobaciones'}
        subtitle={routeTransition === 'dashboard'
          ? 'Salimos de la cola rápida y reconstruimos el tablero con tus métricas y accesos principales.'
          : 'Estamos reabriendo la cola móvil para que sigas aprobando sin fricción.'}
        messages={routeTransition === 'dashboard'
          ? ['Volviendo al dashboard...', 'Recuperando tablero...', 'Ordenando casos activos...']
          : ['Abriendo aprobaciones...', 'Buscando pendientes...', 'Preparando decisión rápida...']}
        metrics={routeTransition === 'dashboard'
          ? [
              { label: 'Pendientes', value: pendingCount },
              { label: 'Destino', value: 'Panel' },
              { label: 'Vista', value: 'Mobile' },
            ]
          : [
              { label: 'Pendientes', value: pendingCount },
              { label: 'Modo', value: 'Rápido' },
              { label: 'Vista', value: 'Mobile' },
            ]}
      />
    )
  }

  return (
    <div>
      {loading ? (
        isMobile ? (
          <MobileWorkspaceLoading
            eyebrow="Aprobaciones"
            title="Estamos cargando aprobaciones"
            subtitle="Preparamos la cola rápida con valores sugeridos y señales de confianza para revisar desde el celular."
            messages={['Cargando pendientes...', 'Calculando valores sugeridos...', 'Ordenando cola de aprobación...']}
            metrics={[
              { label: 'Pendientes', value: '...' },
              { label: 'Modo', value: 'Rápido' },
              { label: 'Vista', value: 'Mobile' },
            ]}
          />
        ) : (
          <LoadingState
            eyebrow="Aprobaciones"
            title="Estamos cargando la cola de revisión"
            subtitle="Armamos la lista de tasaciones pendientes con sus métricas principales para escritorio."
            messages={['Cargando pendientes...', 'Calculando valores sugeridos...', 'Preparando revisión...']}
          />
        )
      ) : (
        isMobile ? (
        <section className="home-mobile-shell approvals-mobile-shell">
          <button
            type="button"
            className={`home-mobile-modal-backdrop${rejectTarget ? ' is-open' : ''}`}
            onClick={() => {
              setRejectTarget(null)
              setRejectMessage('')
            }}
            aria-label="Cerrar solicitud de cambios"
          />

          <div className={`home-mobile-quick-modal approvals-mobile-reject-modal${rejectTarget ? ' is-open' : ''}`} aria-hidden={!rejectTarget}>
            <div className="home-mobile-quick-modal__header">
              <div>
                <span className="home-mobile-section-label">Solicitar cambios</span>
                <strong>{rejectTarget ? rejectTarget.nombre : 'Tasación'}</strong>
              </div>
              <button
                type="button"
                className="home-mobile-quick-modal__close"
                onClick={() => {
                  setRejectTarget(null)
                  setRejectMessage('')
                }}
              >
                ×
              </button>
            </div>
            <div className="home-mobile-quick-modal__body">
              <label className="home-mobile-quick-field">
                <span>Mensaje general</span>
                <textarea
                  className="approvals-mobile-reject-modal__textarea"
                  rows={4}
                  value={rejectMessage}
                  placeholder="Indicá qué debería corregirse antes de aprobar la tasación..."
                  onChange={(e) => setRejectMessage(e.target.value)}
                />
              </label>
            </div>
            <button type="button" className="btn btn-primary home-mobile-quick-modal__submit" onClick={handleRejectConfirm} disabled={savingId === rejectTarget?.id}>
              Confirmar solicitud de cambios
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
                  <span>{user?.is_admin ? 'Administrador aprobador' : 'Workspace operativo'}</span>
                </div>
              </div>
              <button type="button" className="home-mobile-drawer__close" onClick={() => setMobileDrawerOpen(false)}>
                ×
              </button>
            </div>

            <div className="home-mobile-drawer__actions">
              <button type="button" className="settings-sidebar-item settings-sidebar-item--active" onClick={() => handleMobileNavigate('/approvals')}>
                Aprobaciones
              </button>
              <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/')}>
                Volver al dashboard
              </button>
              <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/settings')}>
                Configuración
              </button>
              <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/settings')}>
                Cambiar contraseña
              </button>
              <button type="button" className="settings-sidebar-item" onClick={handleMobileLogout}>
                Cerrar sesión
              </button>
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
                <button type="button" className="home-mobile-utility-pill" onClick={() => handleMobileNavigate('/')}>
                  Dashboard
                </button>
                <button type="button" className="home-mobile-utility-icon" onClick={() => setMobileDrawerOpen(true)} aria-label="Abrir perfil">
                  ≡
                </button>
              </div>
            </header>

            <section className="home-mobile-overview approvals-mobile-overview">
              <span className="home-mobile-overview__eyebrow">Aprobaciones</span>
              <h1>{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
              <p>
                {pendingCount > 0
                  ? `Tenés ${pendingCount} orden${pendingCount === 1 ? '' : 'es'} pendientes para aprobar o pedir cambios.`
                  : 'La cola está al día. Cuando entren nuevas tasaciones pendientes, las vas a ver acá.'}
              </p>
              <div className="approvals-mobile-overview__count">
                <article className="home-mobile-metric-card">
                  <span>Órdenes pendientes</span>
                  <strong>{pendingCount}</strong>
                </article>
              </div>
            </section>
          </section>

          {error && (
            <StateCard
              eyebrow="No pudimos completar la revisión"
              title="La cola no respondió como esperábamos"
              description={error}
              tone="error"
              mode="inline"
            />
          )}
          {message && <div className="alert alert-success">{message}</div>}

          <section className="home-mobile-carousel-block approvals-mobile-carousel-block">
            <div className="home-mobile-block-header">
              <div>
                <span className="home-mobile-section-label">Cola rápida</span>
                <strong>Deslizá y resolvé al instante</strong>
              </div>
            </div>

            {items.length > 0 ? (
              <div className="home-mobile-carousel approvals-mobile-carousel" role="list" aria-label="Tasaciones pendientes de aprobación">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className={`approvals-mobile-card approvals-mobile-card--${item.confidence.tone}`}
                    role="listitem"
                    tabIndex={0}
                    onClick={() => handleOpenResults(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenResults(item)
                      }
                    }}
                  >
                    <div className="approvals-mobile-card__top">
                      <span className="approvals-mobile-card__stage">{normalizeStage(item.stage)}</span>
                      <span
                        className="approvals-mobile-card__confidence"
                        style={{ color: item.confidence.color, background: item.confidence.bg }}
                        title={item.confidenceCv != null ? `CV ${item.confidenceCv.toFixed(1)}%` : 'Sin cálculo de confianza'}
                      >
                        {item.confidence.short}
                      </span>
                    </div>

                    <div className="approvals-mobile-card__body">
                      <strong>{item.nombre}</strong>
                      <p>{item.direccion}</p>
                    </div>

                    <div className="approvals-mobile-card__stats">
                      <div>
                        <span>Promedio m²</span>
                        <strong>{fmtM2(item.avgPriceM2)}</strong>
                      </div>
                      <div>
                        <span>Publicación sugerida</span>
                        <strong>{fmtUSD(item.suggestedPrice)}</strong>
                      </div>
                      <div className="approvals-mobile-card__stat approvals-mobile-card__stat--wide">
                        <span>Tasa de confianza</span>
                        <strong>{item.confidence.label}{item.confidenceCv != null ? ` · CV ${item.confidenceCv.toFixed(1)}%` : ''}</strong>
                      </div>
                    </div>

                    <div className="approvals-mobile-card__footer">
                      <button
                        type="button"
                        className="btn btn-secondary approvals-mobile-card__action"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRejectTarget(item)
                          setRejectMessage('')
                        }}
                        disabled={savingId === item.id}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary approvals-mobile-card__action"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleApprove(item)
                        }}
                        disabled={savingId === item.id}
                      >
                        {savingId === item.id ? 'Guardando...' : 'Aprobar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="kanban-empty">
                No hay tasaciones pendientes para revisar en este momento.
              </div>
            )}
          </section>
        </section>
        ) : (
          <div className="approvals-desktop-page">
            <div className="step-header">
              <h1>Cola de aprobaciones</h1>
              <p>Revisá las tasaciones pendientes, validá sus métricas principales y aprobá o pedí cambios desde una sola vista.</p>
            </div>

            {error && (
              <StateCard
                eyebrow="No pudimos completar la revisión"
                title="La cola no respondió como esperábamos"
                description={error}
                tone="error"
                mode="inline"
              />
            )}
            {message && <div className="alert alert-success">{message}</div>}

            <div className="approvals-layout approvals-layout--desktop">
              <section className="card approvals-desktop-panel">
                <div className="approvals-panel__header">
                  <div>
                    <span className="page-eyebrow">Cola</span>
                    <h2>Pendientes</h2>
                  </div>
                  <span className="approvals-panel__count">{pendingCount}</span>
                </div>

                {items.length > 0 ? (
                  <div className="approvals-list">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`approvals-list__item${selectedId === item.id ? ' is-active' : ''}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="approvals-list__stage">{normalizeStage(item.stage)}</span>
                        <strong>{item.nombre}</strong>
                        <span>{item.direccion}</span>
                        <span>{item.owner_username || 'Sin usuario'} · {item.comparableCount} comp.</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <StateCard
                    eyebrow="Cola vacía"
                    title="No hay tasaciones pendientes"
                    description="Cuando el equipo envíe casos a revisión, los vas a ver listados acá."
                    tone="empty"
                    mode="inline"
                  />
                )}
              </section>

              <section className="card approvals-desktop-panel">
                <div className="approvals-panel__header">
                  <div>
                    <span className="page-eyebrow">Detalle</span>
                    <h2>Revisión</h2>
                  </div>
                </div>

                {selectedItem ? (
                  <div className="approvals-detail">
                    <div className="approvals-detail__hero">
                      <div className="approvals-detail__hero-top">
                        <span className="approvals-detail__stage">{normalizeStage(selectedItem.stage)}</span>
                        <span
                          className="approvals-mobile-card__confidence"
                          style={{ color: selectedItem.confidence.color, background: selectedItem.confidence.bg }}
                        >
                          {selectedItem.confidence.short}
                        </span>
                      </div>
                      <div className="approvals-detail__title">{selectedItem.nombre}</div>
                      <div className="approvals-detail__address">{selectedItem.direccion}</div>
                      <div className="approvals-detail__meta">
                        {(selectedItem.owner_username || 'Sin usuario')} · {selectedItem.comparableCount} comparables
                      </div>
                    </div>

                    <div className="approval-summary">
                      <div>
                        <span className="approval-summary__label">Promedio m²</span>
                        <strong>{fmtM2(selectedItem.avgPriceM2)}</strong>
                      </div>
                      <div>
                        <span className="approval-summary__label">Publicación sugerida</span>
                        <strong>{fmtUSD(selectedItem.suggestedPrice)}</strong>
                      </div>
                      <div>
                        <span className="approval-summary__label">Confianza</span>
                        <strong>{selectedItem.confidence.label}</strong>
                      </div>
                      <div>
                        <span className="approval-summary__label">Coeficiente de variación</span>
                        <strong>{selectedItem.confidenceCv != null ? `${selectedItem.confidenceCv.toFixed(1)}%` : 'Sin cálculo'}</strong>
                      </div>
                    </div>

                    <div className="approvals-comments-header">
                      <div>
                        <h3 className="approvals-comments-header__title">Mensaje general</h3>
                        <p className="approvals-detail__meta">Se usa si pedís cambios sobre esta tasación.</p>
                      </div>
                    </div>

                    <textarea
                      className="approvals-mobile-reject-modal__textarea"
                      rows={5}
                      value={desktopRejectMessage}
                      placeholder="Indicá qué debería corregirse antes de aprobar la tasación..."
                      onChange={(e) => setDesktopRejectMessage(e.target.value)}
                    />

                    <div className="btn-group approvals-actions">
                      <button className="btn btn-secondary" onClick={() => navigate('/')}>
                        Volver al dashboard
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleOpenResults(selectedItem)}>
                        Abrir resultados
                      </button>
                      <div className="approvals-actions__group">
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleReview(selectedItem, 'Cambios solicitados', desktopRejectMessage)}
                          disabled={savingId === selectedItem.id}
                        >
                          Solicitar cambios
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleApprove(selectedItem)}
                          disabled={savingId === selectedItem.id}
                        >
                          {savingId === selectedItem.id ? 'Guardando...' : 'Aprobar tasación'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <StateCard
                    eyebrow="Sin selección"
                    title="Elegí una tasación para revisar"
                    description="Seleccioná un caso de la lista para ver su resumen y decidir la aprobación."
                    tone="empty"
                    mode="inline"
                  />
                )}
              </section>
            </div>
          </div>
        )
      )}
    </div>
  )
}
