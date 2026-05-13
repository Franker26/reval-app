import React, { useEffect, useState } from 'react'
import { useConfirm } from '../../App.jsx'
import InlineNotice from '../../components/InlineNotice.jsx'
import { LoadingState } from '../../components/StatusState.jsx'
import { createModifier, deleteModifier, listModifiers, updateModifier } from '../../api.js'
import { SectionTitle } from './shared.jsx'

const FACTOR_KEY_LABELS = {
  antiguedad_por_decada:    'Antigüedad — por década de diferencia',
  estado_a_refaccionar:     'Estado — a refaccionar vs standard',
  calidad_superior:         'Calidad — superior (factor directo)',
  calidad_inferior:         'Calidad — inferior (factor directo)',
  superficie_por_decima:    'Superficie — por décima de ratio',
  piso_por_nivel:           'Piso — por nivel de diferencia',
  orientacion_sur_vs_norte: 'Orientación — sur vs norte',
  orientacion_interno:      'Orientación — interno',
  distribucion_mala:        'Distribución — regular vs buena',
  oferta_mas_de_un_anio:    'Oferta — más de 12 meses en mercado',
  oferta_menos_de_un_anio:  'Oferta — menos de 12 meses en mercado',
  oportunidad_mercado:      'Oportunidad de mercado',
  cochera:                  'Cochera',
  pileta:                   'Pileta',
}

const EMPTY_MODIFIER = { factor_key: 'calidad_superior', option_label: '', factor_value: '1.00' }

export default function ModifiersPanel() {
  const [modifiers, setModifiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_MODIFIER)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    listModifiers()
      .then(setModifiers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.option_label.trim()) return
    const payload = {
      factor_key: form.factor_key,
      option_label: form.option_label.trim(),
      factor_value: parseFloat(form.factor_value) || 1.0,
    }
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        const updated = await updateModifier(editId, { option_label: payload.option_label, factor_value: payload.factor_value })
        setModifiers((prev) => prev.map((m) => (m.id === editId ? updated : m)))
      } else {
        const created = await createModifier(payload)
        setModifiers((prev) => [...prev, created])
      }
      setForm(EMPTY_MODIFIER)
      setEditId(null)
      setShowForm(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(m) {
    setForm({ factor_key: m.factor_key, option_label: m.option_label, factor_value: String(m.factor_value) })
    setEditId(m.id)
    setShowForm(true)
  }

  async function handleDelete(id) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar opción',
      title: 'Esta opción personalizada se va a eliminar',
      description: 'La configuración dejará de estar disponible para nuevas tasaciones y ajustes.',
      confirmLabel: 'Eliminar opción',
      cancelLabel: 'Mantener opción',
    })
    if (!accepted) return

    try {
      await deleteModifier(id)
      setModifiers((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  function handleCancel() {
    setForm(EMPTY_MODIFIER)
    setEditId(null)
    setShowForm(false)
  }

  const grouped = Object.entries(FACTOR_KEY_LABELS).reduce((acc, [key, label]) => {
    const items = modifiers.filter((m) => m.factor_key === key)
    if (items.length) acc.push({ key, label, items })
    return acc
  }, [])
  // Include any modifiers whose key isn't in FACTOR_KEY_LABELS
  const knownKeys = new Set(Object.keys(FACTOR_KEY_LABELS))
  const ungrouped = modifiers.filter((m) => !knownKeys.has(m.factor_key))
  if (ungrouped.length) grouped.push({ key: '__other__', label: 'Otros', items: ungrouped })

  return (
    <div>
      <SectionTitle>Modificadores</SectionTitle>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
        Configurá las opciones de calificación y sus factores de ajuste para cada campo. El valor <strong>1.00</strong> es la referencia neutral (0%).
      </p>
      {error && <InlineNotice tone="error" title="No pudimos actualizar las opciones" description={error} className="notice--spaced" />}

      <div className="settings-group-header" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Opciones configuradas</span>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Nueva opción
          </button>
        )}
      </div>

      {showForm && (
        <div className="settings-group" style={{ marginBottom: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 120px', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Campo</label>
                <select
                  value={form.factor_key}
                  onChange={(e) => handleFormChange('factor_key', e.target.value)}
                  disabled={!!editId}
                >
                  {Object.entries(FACTOR_KEY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Etiqueta</label>
                <input
                  type="text"
                  value={form.option_label}
                  onChange={(e) => handleFormChange('option_label', e.target.value)}
                  placeholder="Ej: Superior"
                  required
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Factor</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.5"
                  max="2"
                  value={form.factor_value}
                  onChange={(e) => handleFormChange('factor_value', e.target.value)}
                />
              </div>
            </div>
            <div className="settings-actions-row" style={{ marginTop: 10 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? <span className="spinner" /> : editId ? 'Guardar cambios' : 'Crear opción'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingState
          eyebrow="Configuración"
          title="Estamos cargando los modificadores"
          subtitle="Recuperamos las opciones personalizadas para que puedas editarlas con contexto."
          messages={['Cargando opciones...', 'Ordenando modificadores...', 'Preparando edición...']}
          mode="inline"
        />
      ) : modifiers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay opciones configuradas aún. Creá la primera con el botón de arriba.</p>
      ) : (
        <div className="settings-group" style={{ padding: 0 }}>
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Opción</th>
                <th>Factor</th>
                <th>%</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, label, items }) =>
                items.map((m, i) => (
                  <tr key={m.id}>
                    {i === 0 && (
                      <td rowSpan={items.length} style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 12 }}>
                        {label}
                      </td>
                    )}
                    <td>{m.option_label}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.factor_value.toFixed(3)}</td>
                    <td className={m.factor_value > 1 ? 'factor-val--positive' : m.factor_value < 1 ? 'factor-val--negative' : ''}>
                      {m.factor_value > 1 ? '+' : ''}{Math.round((m.factor_value - 1) * 100)}%
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(m)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
