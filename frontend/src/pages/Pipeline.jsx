import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteACM, listACMs, updateACM } from '../api.js'
import { useAuth, useConfirm, useWizard } from '../App.jsx'
import { LoadingState, StateCard } from '../components/StatusState.jsx'
import { avatarColor, initials } from '../utils/avatars.js'
import { ACM_STAGES } from '../constants/status.js'

const COLUMNS = ACM_STAGES

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

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-AR')
}

export default function Pipeline() {
  const [acms, setAcms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const { dispatch } = useWizard()
  const confirm = useConfirm()
  const navigate = useNavigate()

  useEffect(() => {
    listACMs()
      .then(setAcms)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleWindowClick() { setOpenMenuId(null) }
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const grouped = useMemo(() => {
    const base = Object.fromEntries(COLUMNS.map((col) => [col.key, []]))
    for (const acm of acms) {
      const key = acm.stage || 'nuevo'
      if (!base[key]) base[key] = []
      base[key].push(acm)
    }
    Object.values(base).forEach((items) =>
      items.sort((a, b) => new Date(b.updated_at || b.fecha_creacion) - new Date(a.updated_at || a.fecha_creacion))
    )
    return base
  }, [acms])

  function handleNew() {
    dispatch({ type: 'RESET' })
    navigate('/acm/tipo')
  }

  async function handleDelete(id, nombre) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar tasación',
      title: `Se va a eliminar "${nombre}"`,
      description: 'Esta acción quitará la tasación del tablero. Si querés conservar el historial, podés moverla a Cancelado en lugar de eliminarla.',
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

  async function handleStageChange(acm, stage) {
    if (acm.stage === stage) return
    setUpdatingId(acm.id)
    setAcms((prev) => prev.map((item) => (item.id === acm.id ? { ...item, stage } : item)))
    try {
      const updated = await updateACM(acm.id, { stage })
      setAcms((prev) => prev.map((item) => (item.id === acm.id ? { ...item, ...updated } : item)))
    } catch (e) {
      setAcms((prev) => prev.map((item) => (item.id === acm.id ? { ...item, stage: acm.stage } : item)))
      setError(e.message)
    } finally {
      setUpdatingId(null)
    }
  }

  function handleDragStart(e, acm) {
    setDraggedId(acm.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, colKey) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colKey)
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null)
  }

  async function handleDrop(e, colKey) {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggedId) return
    const acm = acms.find((a) => a.id === draggedId)
    setDraggedId(null)
    if (acm) await handleStageChange(acm, colKey)
  }

  function handleDragEnd() {
    setDraggedId(null)
    setDragOverCol(null)
  }

  if (loading) {
    return (
      <LoadingState
        eyebrow="Cargando pipeline"
        title="Preparamos el tablero de etapas"
        subtitle="Sincronizamos tasaciones y etapas del equipo."
        messages={['Cargando tablero...', 'Preparando workspace...', 'Sincronizando datos...']}
        step="Pipeline"
      />
    )
  }

  if (error) {
    return (
      <StateCard
        eyebrow="No pudimos cargar el pipeline"
        title="El panel no respondió como esperábamos"
        description={error}
        tone="error"
        mode="inline"
        actions={<button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>}
      />
    )
  }

  return (
    <div className="pipeline-page">
      <div className="pipeline-page__header">
        <div>
          <span className="home-panel__eyebrow">Pipeline</span>
          <h1>Estado de tasaciones por etapa</h1>
          <p>Abrí una ficha o arrastrala para reorganizar el flujo de trabajo.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNew}>
          + Nueva tasación
        </button>
      </div>

      <div className="kanban-board pipeline-board">
        {COLUMNS.map((column) => {
          const isDragTarget = dragOverCol === column.key
          const isCancelled = column.key === 'cancelado'
          return (
            <section
              key={column.key}
              className={`kanban-column kanban-column--${column.tone}${isDragTarget ? ' kanban-column--drop-target' : ''}${isCancelled ? ' kanban-column--cancelled' : ''}`}
              onDragOver={(e) => handleDragOver(e, column.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.key)}
            >
              <div className="kanban-column__header">
                <div>
                  <span className="kanban-column__eyebrow">Etapa</span>
                  <h2>{column.title}</h2>
                  <p>{column.description}</p>
                </div>
                <span>{grouped[column.key]?.length || 0}</span>
              </div>

              <div className="kanban-column__body">
                {(grouped[column.key] || []).map((acm) => {
                  const isBeingDragged = draggedId === acm.id
                  const status = statusMeta(acm)
                  return (
                    <article
                      key={acm.id}
                      className={`kanban-card${isCancelled ? ' kanban-card--cancelled' : ''}`}
                      draggable={!updatingId}
                      onDragStart={(e) => handleDragStart(e, acm)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleOpen(acm)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(acm) }
                      }}
                      tabIndex={0}
                      role="button"
                      style={{ opacity: isBeingDragged ? 0.4 : 1, cursor: 'grab' }}
                    >
                      <div className="kanban-card__top">
                        <div>
                          <div className="kanban-card__title">{acm.nombre}</div>
                          <div className="kanban-card__address">{acm.direccion}</div>
                        </div>
                        <div className="kanban-card__top-actions">
                          <span
                            className={`kanban-card__signal kanban-card__signal--${status.tone}`}
                            title={status.hint}
                            aria-label={status.dotLabel}
                          >
                            <span className="kanban-card__signal-dot" aria-hidden="true" />
                            <span className="sr-only">{status.dotLabel}</span>
                          </span>
                          <div className="kanban-card__menu-wrap">
                            <button
                              type="button"
                              className="kanban-card__menu-trigger"
                              aria-label="Más acciones"
                              aria-expanded={openMenuId === acm.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId((cur) => cur === acm.id ? null : acm.id)
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              ⋯
                            </button>
                            {openMenuId === acm.id && (
                              <div className="kanban-card__menu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="kanban-card__menu-item kanban-card__menu-item--danger"
                                  onClick={() => handleDelete(acm.id, acm.nombre)}
                                >
                                  Eliminar tasación
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="kanban-card__meta">
                        <div className="kanban-card__owner">
                          <div className="kanban-card__avatar" style={{ background: avatarColor(acm.owner_username || acm.nombre) }}>
                            {initials(acm.owner_username || acm.nombre)}
                          </div>
                          <span>{acm.owner_username || 'Sin asignar'}</span>
                        </div>
                        <span>Act. {formatDate(acm.updated_at || acm.fecha_creacion)}</span>
                      </div>

                      <div className="kanban-card__insights">
                        <span className="kanban-card__chip">{comparablesLabel(acm)}</span>
                        <span className="kanban-card__chip">{stageProgress(acm)}</span>
                      </div>

                      <div className="kanban-card__footer">
                        <div className="kanban-card__footer-note">Abrí la ficha o arrastrá para mover de etapa.</div>
                      </div>
                    </article>
                  )
                })}
                {(!grouped[column.key] || grouped[column.key].length === 0) && (
                  <div className={`kanban-empty${isDragTarget ? ' kanban-empty--highlight' : ''}`}>
                    {isDragTarget ? 'Soltá aquí para mover la tasación.' : 'Todavía no hay tasaciones en esta etapa.'}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
