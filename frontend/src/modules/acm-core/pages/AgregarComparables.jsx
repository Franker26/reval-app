import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addComparable, deleteComparable, extractProperty, getACM, updateComparable } from '../../../api.js'
import { useWizard } from '../contexts/WizardContext.jsx'
import { useConfirm } from '../../../contexts/ConfirmContext.jsx'
import WizardNav from '../components/WizardNav.jsx'
import InlineNotice from '../../../components/InlineNotice.jsx'
import PropertyForm from '../../../components/PropertyForm.jsx'
import SmartLoader from '../../../components/SmartLoader.jsx'
import { getFriendlyFieldError } from '../../../utils/feedback.js'

const EMPTY_COMP = {
  url: '',
  precio: '',
  dias_mercado: '',
  oportunidad_mercado: false,
  direccion: '',
  tipo: '',
  superficie_cubierta: '',
  superficie_semicubierta: '',
  superficie_descubierta: '',
  piso: '',
  antiguedad: '',
  orientacion: '',
  estado: '',
  calidad: '',
  distribucion: '',
  cochera: false,
  pileta: false,
}

function toPayload(v) {
  return {
    url: v.url.trim() || null,
    precio: Number(v.precio),
    dias_mercado: v.dias_mercado ? Number(v.dias_mercado) : null,
    oportunidad_mercado: v.oportunidad_mercado,
    direccion: v.direccion.trim() || null,
    tipo: v.tipo || null,
    superficie_cubierta: Number(v.superficie_cubierta),
    superficie_semicubierta: v.superficie_semicubierta ? Number(v.superficie_semicubierta) : null,
    superficie_descubierta: v.superficie_descubierta ? Number(v.superficie_descubierta) : null,
    piso: v.piso ? Number(v.piso) : null,
    antiguedad: v.antiguedad ? Number(v.antiguedad) : null,
    orientacion: v.orientacion || null,
    estado: v.estado || null,
    calidad: v.calidad || null,
    distribucion: v.distribucion || null,
    cochera: v.cochera,
    pileta: v.pileta,
  }
}

function homoM2(comp) {
  const h = comp.superficie_cubierta
    + 0.5 * (comp.superficie_semicubierta || 0)
    + 0.3 * (comp.superficie_descubierta || 0)
  return h > 0 ? h : comp.superficie_cubierta
}

function sourceLabel(url) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function comparableLabel(comp, index) {
  return comp.direccion || sourceLabel(comp.url) || `Comparable ${index + 1}`
}

export default function AgregarComparables() {
  const { id } = useParams()
  const [comparables, setComparables] = useState([])
  const [form, setForm] = useState(EMPTY_COMP)
  const [editId, setEditId] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [extractPreview, setExtractPreview] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const retryTimerRef = React.useRef(null)
  const [pageReady, setPageReady] = useState(false)
  const { dispatch } = useWizard()
  const navigate = useNavigate()
  const confirm = useConfirm()

  useEffect(() => {
    getACM(id).then((acm) => {
      setComparables(acm.comparables)
      dispatch({ type: 'SET_ACM_ID', payload: acm.id })
      setShowForm(acm.comparables.length === 0)
      setPageReady(true)
    })
  }, [id])

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  function validate(v) {
    const err = {}
    if (!v.precio || Number(v.precio) <= 0) err.precio = getFriendlyFieldError('Requerido')
    if (!v.superficie_cubierta || Number(v.superficie_cubierta) <= 0) {
      err.superficie_cubierta = getFriendlyFieldError('Debe ser mayor a 0')
    }
    return err
  }

  const SUPPORTED_SOURCES = ['zonaprop.com.ar', 'argenprop.com', 'mercadolibre.com.ar']
  const isSupportedUrl = SUPPORTED_SOURCES.some((s) => form.url?.includes(s))
  const currentSource = sourceLabel(form.url)

  async function handleExtract() {
    if (!form.url || !isSupportedUrl) return
    setExtracting(true)
    setRetrying(false)
    setExtractError(null)
    retryTimerRef.current = setTimeout(() => setRetrying(true), 10_000)
    try {
      const data = await extractProperty(form.url)
      setExtractPreview(data)
    } catch (e) {
      setExtractError(e.message)
    } finally {
      clearTimeout(retryTimerRef.current)
      setExtracting(false)
      setRetrying(false)
    }
  }

  function handleConfirmExtract() {
    const data = extractPreview
    setForm((prev) => ({
      ...prev,
      ...(data.precio != null ? { precio: String(data.precio) } : {}),
      ...(data.dias_mercado != null ? { dias_mercado: String(data.dias_mercado) } : {}),
      ...(data.direccion ? { direccion: data.direccion } : {}),
      ...(data.superficie_cubierta != null ? { superficie_cubierta: String(data.superficie_cubierta) } : {}),
      ...(data.tipo ? { tipo: data.tipo } : {}),
      ...(data.orientacion ? { orientacion: data.orientacion } : {}),
      ...(data.antiguedad != null ? { antiguedad: String(data.antiguedad) } : {}),
    }))
    setExtractPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const err = validate(form)
    if (Object.keys(err).length) {
      setErrors(err)
      return
    }
    setSubmitting(true)
    setApiError(null)
    try {
      if (editId) {
        const updated = await updateComparable(id, editId, toPayload(form))
        setComparables((prev) => prev.map((c) => (c.id === editId ? updated : c)))
      } else {
        const added = await addComparable(id, toPayload(form))
        setComparables((prev) => [...prev, added])
      }
      setForm(EMPTY_COMP)
      setEditId(null)
      setShowForm(false)
    } catch (e) {
      setApiError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleEdit(comp) {
    setForm({
      url: comp.url || '',
      precio: comp.precio || '',
      dias_mercado: comp.dias_mercado || '',
      oportunidad_mercado: comp.oportunidad_mercado || false,
      direccion: comp.direccion || '',
      tipo: comp.tipo || '',
      superficie_cubierta: comp.superficie_cubierta || '',
      superficie_semicubierta: comp.superficie_semicubierta ?? '',
      superficie_descubierta: comp.superficie_descubierta ?? '',
      piso: comp.piso ?? '',
      antiguedad: comp.antiguedad ?? '',
      orientacion: comp.orientacion || '',
      estado: comp.estado || '',
      calidad: comp.calidad || '',
      distribucion: comp.distribucion || '',
      cochera: comp.cochera || false,
      pileta: comp.pileta || false,
    })
    setEditId(comp.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(cid) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar comparable',
      title: 'Esta comparable se va a quitar de la tasación',
      description: 'Podés volver a cargarla después, pero se perderán los cambios hechos sobre este registro.',
      confirmLabel: 'Eliminar comparable',
      cancelLabel: 'Mantener comparable',
    })
    if (!accepted) return

    try {
      await deleteComparable(id, cid)
      setComparables((prev) => prev.filter((c) => c.id !== cid))
    } catch (e) {
      setApiError(e.message)
    }
  }

  function handleCancel() {
    setForm(EMPTY_COMP)
    setEditId(null)
    setShowForm(false)
  }

  const logoSrc = typeof localStorage !== 'undefined' ? localStorage.getItem('acm_theme_logo') : null

  if (!pageReady) return null

  return (
    <div>
      <SmartLoader loading={extracting} logoSrc={logoSrc} message={retrying ? 'Reintentando extracción...' : undefined} />
      <WizardNav currentStep={2} />

      <div className="step-header step-header--compact">
        <span className="page-eyebrow">Paso 2</span>
        <h1>Agregar comparables</h1>
        <p>Construí la base de mercado con publicaciones útiles, extracción asistida y una lectura clara antes de pasar a ponderadores.</p>
      </div>

      <div className="workflow-layout workflow-layout--single">
        <div className="workflow-main">
          {apiError && (
            <InlineNotice
              tone="error"
              title="No pudimos guardar la comparable"
              description={apiError}
              className="notice--spaced"
            />
          )}

          <section className="workflow-stats-grid" aria-label="Resumen del paso">
            <article className="workflow-stat-card">
              <span className="workflow-stat-card__label">Comparables cargadas</span>
              <strong>{comparables.length}</strong>
              <p>{comparables.length > 0 ? 'Muestra activa para revisar.' : 'Todavía no hay base inicial.'}</p>
            </article>
            <article className="workflow-stat-card">
              <span className="workflow-stat-card__label">Portales soportados</span>
              <strong>{SUPPORTED_SOURCES.length}</strong>
              <p>{currentSource ? `Detectamos ${currentSource}.` : 'Zonaprop, Argenprop y Mercado Libre.'}</p>
            </article>
            <article className="workflow-stat-card">
              <span className="workflow-stat-card__label">Paso siguiente</span>
              <strong>{comparables.length > 0 ? 'Ponderadores listos' : 'Esperando muestra mínima'}</strong>
              <p>{comparables.length > 0 ? 'Podés seguir al paso 3 cuando cierres esta base.' : 'Necesitás al menos una comparable para continuar.'}</p>
            </article>
          </section>

          {comparables.length > 0 && (
            <div className="card workflow-card">
              <div className="section-heading">
                <div>
                  <span className="section-heading__eyebrow">Base cargada</span>
                  <h2>Comparables activas ({comparables.length})</h2>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="workspace-table workspace-table--comparables">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Comparable</th>
                      <th>Fuente</th>
                      <th>Mercado</th>
                      <th>Precio USD</th>
                      <th>Sup. hom. m²</th>
                      <th>USD/m²</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparables.map((c, i) => {
                      const h = homoM2(c)
                      const pm2 = c.precio_m2_publicado ?? Math.round(c.precio / c.superficie_cubierta)
                      const source = sourceLabel(c.url)
                      return (
                        <tr key={c.id}>
                          <td className="workspace-table__index">{i + 1}</td>
                          <td className="workspace-table__cell-ellipsis">
                            <div className="workspace-table__primary workspace-table__primary--comparable">
                              <strong>{comparableLabel(c, i)}</strong>
                              <span>{c.tipo || 'Tipo sin definir'} · {h.toFixed(1)} m² hom.</span>
                            </div>
                          </td>
                          <td>
                            <span className={`workspace-pill${c.url ? '' : ' workspace-pill--muted'}`}>
                              {source || 'Manual'}
                            </span>
                          </td>
                          <td>
                            {c.dias_mercado
                              ? `${c.dias_mercado} días`
                              : c.oportunidad_mercado
                                ? 'Oportunidad'
                                : 'Sin dato'}
                          </td>
                          <td>USD {c.precio.toLocaleString('es-AR')}</td>
                          <td>{h.toFixed(1)} m²</td>
                          <td><strong>USD {Math.round(pm2).toLocaleString('es-AR')}</strong></td>
                          <td>
                            <div className="table-actions">
                              {c.url && (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="workspace-link-action"
                                  title="Abrir publicación"
                                >
                                  <span>Publicación</span>
                                  <span aria-hidden="true">↗</span>
                                </a>
                              )}
                              <button className="btn btn-secondary btn-sm table-actions__edit" onClick={() => handleEdit(c)}>Editar</button>
                              <button
                                className="table-actions__delete"
                                onClick={() => handleDelete(c.id)}
                                aria-label="Eliminar comparable"
                                title="Eliminar comparable"
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showForm ? (
            <div className="card workflow-card">
              <div className="section-heading">
                <div>
                  <span className="section-heading__eyebrow">{editId ? 'Edición' : 'Carga asistida'}</span>
                  <h2>{editId ? 'Editar comparable' : 'Nueva comparable'}</h2>
                </div>
              </div>
              <p className="workflow-note">
                Pegá una publicación para extraer datos base automáticamente o completá la ficha manualmente si la fuente no está disponible.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-group full">
                    <label>URL de publicación</label>
                    <div className="inline-control-row inline-control-row--url">
                      <input
                        type="url"
                        name="url"
                        value={form.url}
                        tabIndex={1}
                        onChange={(e) => { handleChange('url', e.target.value); setExtractError(null) }}
                        placeholder="https://www.zonaprop.com.ar/, argenprop.com o mercadolibre.com.ar/..."
                      />
                      {form.url && (
                        <a
                          href={form.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="input-link-action"
                          tabIndex={-1}
                          aria-label="Abrir publicación"
                          title="Abrir publicación"
                        >
                          ↗
                        </a>
                      )}
                      {isSupportedUrl && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleExtract}
                          disabled={extracting}
                        >
                          {retrying ? 'Reintentando...' : extracting ? 'Extrayendo...' : 'Extraer datos'}
                        </button>
                      )}
                    </div>
                    {currentSource && (
                      <div className="workflow-inline-meta">Fuente detectada: <strong>{currentSource}</strong></div>
                    )}
                    {extractError && (
                      <InlineNotice
                        tone="warning"
                        title="No pudimos completar la extracción automática"
                        description={extractError}
                        compact
                        className="notice--tight"
                      />
                    )}
                  </div>
                  <div className="form-group full">
                    <label>Dirección</label>
                    <input
                      type="text"
                      name="direccion"
                      value={form.direccion}
                      tabIndex={2}
                      onChange={(e) => handleChange('direccion', e.target.value)}
                      placeholder="Ej: Av. Corrientes 1234"
                    />
                  </div>
                  <div className="form-group">
                    <label>Precio publicado (USD) *</label>
                    <input
                      type="number"
                      name="precio"
                      min="1"
                      step="1"
                      tabIndex={3}
                      value={form.precio}
                      onChange={(e) => handleChange('precio', e.target.value)}
                    />
                    {errors.precio && <span className="error-msg">{errors.precio}</span>}
                  </div>
                  <div className="form-group">
                    <label>Días en el mercado</label>
                    <input
                      type="number"
                      name="dias_mercado"
                      min="0"
                      step="1"
                      tabIndex={4}
                      value={form.dias_mercado}
                      onChange={(e) => handleChange('dias_mercado', e.target.value)}
                    />
                  </div>
                  <div className="form-group full">
                    <label>Oportunidad de mercado</label>
                    <div className="checkbox-row">
                      <label className="checkbox-row__label">
                        <input
                          type="checkbox"
                          tabIndex={5}
                          checked={form.oportunidad_mercado}
                          onChange={(e) => handleChange('oportunidad_mercado', e.target.checked)}
                        />
                        Precio competitivo (aplica ×0.95)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="workflow-section-spacer">
                  <PropertyForm values={form} onChange={handleChange} errors={errors} />
                </div>

                <div className="btn-group">
                  <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting && <span className="spinner" />}
                    {editId ? 'Guardar cambios' : 'Agregar comparable'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card workflow-card workflow-inline-card">
              <div>
                <span className="section-heading__eyebrow">Movimiento rápido</span>
                <h2>Seguí ampliando la muestra</h2>
                <p className="workflow-note">Sumá otra publicación para mejorar la lectura del mercado antes de pasar a ponderadores.</p>
              </div>
              <button className="btn btn-secondary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_COMP) }}>
                + Agregar otra comparable
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="btn-group btn-group--workspace">
        <button className="btn btn-secondary" onClick={() => navigate(`/acm/${id}/step/1`)}>← Paso 1</button>
        <button className="btn btn-primary" disabled={comparables.length === 0} onClick={() => navigate(`/acm/${id}/step/3`)}>
          Continuar → Paso 3
        </button>
      </div>
      {comparables.length === 0 && (
        <p className="error-msg" style={{ textAlign: 'right', marginTop: 4 }}>Sumá al menos una comparable para avanzar al siguiente paso.</p>
      )}

      {extractPreview && (
        <div className="extract-modal">
          <div className="extract-modal__box">
            <h3>Datos extraídos de la publicación</h3>
            <p>Revisá los datos encontrados y confirmá para cargarlos en el formulario.</p>
            <table className="extract-modal__table">
              <tbody>
                {extractPreview.precio != null && (
                  <tr><td className="extract-modal__label">Precio</td><td><strong>USD {extractPreview.precio.toLocaleString('es-AR')}</strong></td></tr>
                )}
                {extractPreview.direccion && (
                  <tr><td className="extract-modal__label">Dirección</td><td>{extractPreview.direccion}</td></tr>
                )}
                {extractPreview.superficie_cubierta != null && (
                  <tr><td className="extract-modal__label">Sup. cubierta</td><td>{extractPreview.superficie_cubierta} m²</td></tr>
                )}
                {extractPreview.tipo && (
                  <tr><td className="extract-modal__label">Tipo</td><td>{extractPreview.tipo}</td></tr>
                )}
                {extractPreview.dias_mercado != null && (
                  <tr><td className="extract-modal__label">Días en mercado</td><td>{extractPreview.dias_mercado}</td></tr>
                )}
                {extractPreview.orientacion && (
                  <tr><td className="extract-modal__label">Orientación</td><td>{extractPreview.orientacion}</td></tr>
                )}
                {extractPreview.antiguedad != null && (
                  <tr><td className="extract-modal__label">Antigüedad</td><td>{extractPreview.antiguedad} años</td></tr>
                )}
              </tbody>
            </table>
            <div className="extract-modal__actions">
              <button className="btn btn-secondary" onClick={() => setExtractPreview(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirmExtract}>Confirmar e insertar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
