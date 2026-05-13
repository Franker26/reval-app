import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getACM, getResultado, updateComparable } from '../../../api.js'
import { useWizard } from '../contexts/WizardContext.jsx'
import { useConfirm } from '../../../contexts/ConfirmContext.jsx'
import WizardNav from '../components/WizardNav.jsx'
import InlineNotice from '../../../components/InlineNotice.jsx'
import Tooltip from '../../../components/Tooltip.jsx'
import { LoadingState, StateCard } from '../../../components/StatusState.jsx'

const BASE_FACTORS = [
  {
    key: 'factor_antiguedad',
    label: 'Antigüedad',
    tooltip: 'Ajusta por diferencia de antigüedad entre la comparable y el sujeto. Cada 10 años de diferencia aplica ±5%.',
  },
  {
    key: 'factor_estado',
    label: 'Estado',
    tooltip: 'Compara el estado de conservación: Refaccionado > Standard > A refaccionar. Una categoría de diferencia aplica ±10%.',
  },
  {
    key: 'factor_calidad',
    label: 'Calidad',
    tooltip: 'Ajusta por diferencia en calidad constructiva: Superior, Standard o Inferior. Una categoría de diferencia aplica ±10%.',
  },
  {
    key: 'factor_superficie',
    label: 'Superficie',
    tooltip: 'Ajusta por economías de escala: unidades más grandes tienden a valer menos por m². Se aplica sobre la superficie homogeneizada (cubierta + 0.5×semi + 0.3×desc). Máximo ±30%.',
  },
  {
    key: 'factor_piso',
    label: 'Piso',
    tooltip: 'Ajusta por diferencia de piso. Cada nivel de diferencia aplica ±1.5%. Pisos más altos generalmente valen más.',
  },
  {
    key: 'factor_orientacion',
    label: 'Orientación',
    tooltip: 'Norte > Sur ≈ Este ≈ Oeste > Interno. Si la comparable es interna aplica +10%. Si es sur vs norte del sujeto aplica +5%.',
  },
  {
    key: 'factor_distribucion',
    label: 'Distribución',
    tooltip: 'Penaliza si la comparable tiene distribución Regular vs Buena del sujeto. Aplica ±5%.',
  },
  {
    key: 'factor_oferta',
    label: 'Oferta',
    tooltip: 'Descuenta el precio de oferta típico: ×0.90 si lleva menos de 1 año en mercado, ×0.88 si lleva más de 1 año.',
  },
  {
    key: 'factor_oportunidad',
    label: 'Oportunidad',
    tooltip: 'Si la comparable es una oportunidad de mercado (precio competitivo), se aplica ×0.95 adicional al precio publicado.',
  },
]

const ADV_FACTORS = [
  {
    key: 'factor_cochera',
    label: 'Cochera',
    tooltip: 'Ajusta si existe diferencia en cochera entre comparable y sujeto. ±5% por presencia/ausencia.',
  },
  {
    key: 'factor_pileta',
    label: 'Pileta',
    tooltip: 'Ajusta si existe diferencia en pileta entre comparable y sujeto. ±8% por presencia/ausencia.',
  },
  {
    key: 'factor_luminosidad',
    label: 'Luminosidad',
    tooltip: 'Ajuste manual libre por luminosidad. Sin valor por defecto; dejá en 1.000 si no aplica.',
  },
  {
    key: 'factor_vistas',
    label: 'Vistas',
    tooltip: 'Ajuste manual libre por calidad de vistas. Sin valor por defecto; dejá en 1.000 si no aplica.',
  },
  {
    key: 'factor_amenities',
    label: 'Amenities',
    tooltip: 'Ajuste manual libre por amenities del edificio (gym, sum, coworking, etc). Sin valor por defecto.',
  },
]

const ALL_FACTORS = [...BASE_FACTORS, ...ADV_FACTORS]

const MIN_SLIDER = 70
const MAX_SLIDER = 130
const CENTER = 100

function sliderToFactor(v) { return v / 100 }
function factorToSlider(f) {
  return Math.round(Math.max(MIN_SLIDER, Math.min(MAX_SLIDER, f * 100)))
}

function clampFactor(value) {
  return Math.max(MIN_SLIDER / 100, Math.min(MAX_SLIDER / 100, value))
}

function factorDelta(value) {
  return value - 1
}

function normalizeInputMode(mode) {
  if (mode === 'arrows' || mode === 'numeric') return 'stepper'
  return mode === 'stepper' ? 'stepper' : 'slider'
}

function factorTone(value) {
  const delta = factorDelta(value)
  const strength = Math.min(1, Math.abs(delta) / 0.3)
  if (delta === 0) {
    return {
      className: 'neutral',
      color: '#98a2b3',
      fill: '#d0d5dd',
      glow: 'rgba(208, 213, 221, 0.45)',
    }
  }

  if (delta > 0) {
    const light = 82 - strength * 26
    const fill = `hsl(144 62% ${light}%)`
    return {
      className: 'positive',
      color: `hsl(145 66% ${34 - strength * 8}%)`,
      fill,
      glow: `hsla(145 70% 42% / ${0.18 + strength * 0.24})`,
    }
  }

  const light = 84 - strength * 28
  const fill = `hsl(4 84% ${light}%)`
  return {
    className: 'negative',
    color: `hsl(4 74% ${42 - strength * 8}%)`,
    fill,
    glow: `hsla(4 84% 54% / ${0.18 + strength * 0.24})`,
  }
}

function getTrackStyle(sliderVal) {
  const range = MAX_SLIDER - MIN_SLIDER
  const centerPct = ((CENTER - MIN_SLIDER) / range) * 100
  const fillPct   = ((sliderVal - MIN_SLIDER) / range) * 100
  const tone = factorTone(sliderToFactor(sliderVal))

  if (sliderVal === CENTER) return { background: '#e5e7eb' }

  if (sliderVal < CENTER) {
    return {
      background: `linear-gradient(to right,
        #eef2f6 0%, #eef2f6 ${fillPct}%,
        ${tone.fill} ${fillPct}%, ${tone.fill} ${centerPct}%,
        #dfe5ec ${centerPct}%, #dfe5ec 100%)`,
      boxShadow: `inset 0 0 0 1px ${tone.glow}`,
    }
  }

  return {
    background: `linear-gradient(to right,
      #dfe5ec 0%, #dfe5ec ${centerPct}%,
      ${tone.fill} ${centerPct}%, ${tone.fill} ${fillPct}%,
      #eef2f6 ${fillPct}%, #eef2f6 100%)`,
    boxShadow: `inset 0 0 0 1px ${tone.glow}`,
  }
}

function pctLabel(value) {
  const pct = Math.round((value - 1) * 100)
  if (pct === 0) return '0%'
  return `${pct > 0 ? '+' : ''}${pct}%`
}

function getContext(factorKey, comp, acm) {
  switch (factorKey) {
    case 'factor_antiguedad':
      if (comp.antiguedad != null && acm.antiguedad != null)
        return `Comp: ${comp.antiguedad}a · Sujeto: ${acm.antiguedad}a`
      return null
    case 'factor_estado':
      if (comp.estado && acm.estado) return `Comp: ${comp.estado} · Sujeto: ${acm.estado}`
      return null
    case 'factor_calidad':
      if (comp.calidad && acm.calidad) return `Comp: ${comp.calidad} · Sujeto: ${acm.calidad}`
      return null
    case 'factor_superficie': {
      const cH = (comp.superficie_cubierta + 0.5*(comp.superficie_semicubierta||0) + 0.3*(comp.superficie_descubierta||0)).toFixed(1)
      const aH = (acm.superficie_cubierta + 0.5*(acm.superficie_semicubierta||0) + 0.3*(acm.superficie_descubierta||0)).toFixed(1)
      return `Comp: ${cH} m² · Sujeto: ${aH} m²`
    }
    case 'factor_piso':
      if (comp.piso != null && acm.piso != null)
        return `Comp: piso ${comp.piso} · Sujeto: piso ${acm.piso}`
      return null
    case 'factor_orientacion':
      if (comp.orientacion && acm.orientacion)
        return `Comp: ${comp.orientacion} · Sujeto: ${acm.orientacion}`
      return null
    case 'factor_distribucion':
      if (comp.distribucion && acm.distribucion)
        return `Comp: ${comp.distribucion} · Sujeto: ${acm.distribucion}`
      return null
    case 'factor_oferta':
      return comp.dias_mercado != null ? `${comp.dias_mercado} días en mercado` : null
    case 'factor_oportunidad':
      return comp.oportunidad_mercado ? 'Precio competitivo' : 'Precio normal'
    case 'factor_cochera':
      return `Comp: ${comp.cochera ? 'con' : 'sin'} cochera · Sujeto: ${acm.cochera ? 'con' : 'sin'} cochera`
    case 'factor_pileta':
      return `Comp: ${comp.pileta ? 'con' : 'sin'} pileta · Sujeto: ${acm.pileta ? 'con' : 'sin'} pileta`
    default:
      return null
  }
}

function FactorSlider({ factorKey, label, tooltip, value, recommendation, context, onChange, inputMode = 'slider' }) {
  const sliderVal = factorToSlider(value)
  const range = MAX_SLIDER - MIN_SLIDER
  const recPct = recommendation != null
    ? ((factorToSlider(recommendation) - MIN_SLIDER) / range) * 100
    : null
  const tone = factorTone(value)

  function stepValue(delta) {
    const next = clampFactor(parseFloat((value + delta).toFixed(3)))
    onChange(factorKey, next)
  }

  return (
    <div className={`factor-row factor-row--${tone.className} factor-row--${inputMode}`}>
      <span className="factor-row-label">
        {label}
        {tooltip && (
          <Tooltip text={tooltip}>
            <span className="factor-help">?</span>
          </Tooltip>
        )}
      </span>

      <div className="factor-row-track-wrap">
        {inputMode === 'slider' && (
          <>
            <div className="factor-row-track">
              <input
                type="range"
                min={MIN_SLIDER}
                max={MAX_SLIDER}
                step={1}
                value={sliderVal}
                onChange={(e) => onChange(factorKey, sliderToFactor(Number(e.target.value)))}
                style={getTrackStyle(sliderVal)}
                className="factor-slider"
              />
            </div>
            {recPct != null && (
              <div className="rec-bar">
                <div
                  className="rec-needle"
                  style={{ left: `${recPct}%` }}
                  title={`Recomendado: ${recommendation.toFixed(3)} (${Math.round((recommendation-1)*100) >= 0 ? '+' : ''}${Math.round((recommendation-1)*100)}%)`}
                />
              </div>
            )}
          </>
        )}

        {inputMode === 'stepper' && (
          <div className="factor-stepper">
            <button type="button" className="factor-step-btn factor-step-btn--neg-strong" onClick={() => stepValue(-0.10)}>-10</button>
            <button type="button" className="factor-step-btn factor-step-btn--neg-soft" onClick={() => stepValue(-0.01)}>-1</button>
            <input
              type="number"
              className="factor-step-input"
              step="0.001"
              min={MIN_SLIDER / 100}
              max={MAX_SLIDER / 100}
              value={value.toFixed(3)}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onChange(factorKey, clampFactor(v))
              }}
            />
            <button type="button" className="factor-step-btn factor-step-btn--pos-soft" onClick={() => stepValue(+0.01)}>+1</button>
            <button type="button" className="factor-step-btn factor-step-btn--pos-strong" onClick={() => stepValue(+0.10)}>+10</button>
          </div>
        )}

        {context && <div className="factor-context">{context}</div>}
      </div>
      <span className={`factor-row-pct factor-row-pct--${tone.className}`}>{pctLabel(value)}</span>
      {inputMode === 'slider' && (
        <span className={`factor-row-val factor-row-val--${tone.className}`}>{value.toFixed(3)}</span>
      )}
    </div>
  )
}

function factorTotal(factors, visibleFactors) {
  return visibleFactors.reduce((prod, f) => prod * (factors[f.key] ?? 1), 1)
}

function totalBadgeStyle(total) {
  const dev = Math.abs(total - 1)
  if (dev < 0.03) return { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' }
  if (dev < 0.10) return { background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }
  return { background: '#fce4ec', color: '#c62828', border: '1px solid #ef9a9a' }
}

function ComparableCard({ comp, acm, factors, recommendations, advancedMode, inputMode, onChange }) {
  const precioM2 = comp.precio_m2_publicado ?? (comp.precio / comp.superficie_cubierta)
  const visibleFactors = advancedMode ? ALL_FACTORS : BASE_FACTORS
  const total = factorTotal(factors, visibleFactors)
  const ajustado = precioM2 * total
  const style = totalBadgeStyle(total)

  return (
    <div className="card comparable-adjustment-card">
      <div className="comparable-adjustment-card__header">
        <div>
          <div className="comparable-adjustment-card__title">
            {comp.direccion || comp.url?.slice(0, 50) || `Comparable #${comp.id}`}
          </div>
          <div className="comparable-adjustment-card__meta">
            {comp.superficie_cubierta} m² · USD {comp.precio.toLocaleString('es-AR')} ·{' '}
            <strong>USD {Math.round(precioM2).toLocaleString('es-AR')}/m² pub.</strong>
          </div>
        </div>
        <div className="comparable-adjustment-card__totals">
          <div className="comparable-adjustment-card__badge" style={style}>
            ×{total.toFixed(3)}
          </div>
          <div className="comparable-adjustment-card__value">
            USD {Math.round(ajustado).toLocaleString('es-AR')}/m²
          </div>
        </div>
      </div>

      <div className="factor-grid">
        {visibleFactors.map((f) => (
          <FactorSlider
            key={f.key}
            factorKey={f.key}
            label={f.label}
            tooltip={f.tooltip}
            value={factors[f.key] ?? 1}
            recommendation={recommendations?.[f.key]}
            context={getContext(f.key, comp, acm)}
            onChange={onChange}
            inputMode={inputMode}
          />
        ))}
      </div>
    </div>
  )
}

export default function AplicarPonderadores() {
  const { id } = useParams()
  const [acm, setAcm] = useState(null)
  const [comparables, setComparables] = useState([])
  const [factorMap, setFactorMap] = useState({})
  const [recommendMap, setRecommendMap] = useState({})
  const [advancedMode, setAdvancedMode] = useState(false)
  const [inputMode, setInputMode] = useState(
    () => normalizeInputMode(localStorage.getItem('acm_factor_input_mode'))
  )

  function handleInputModeChange(mode) {
    setInputMode(mode)
    localStorage.setItem('acm_factor_input_mode', mode)
  }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { dispatch } = useWizard()
  const confirm = useConfirm()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([getACM(id), getResultado(id).catch(() => null)])
      .then(([acmData, resultado]) => {
        setAcm(acmData)
        setComparables(acmData.comparables)
        dispatch({ type: 'SET_ACM_ID', payload: acmData.id })

        const initial = {}
        const recoms = {}
        for (const comp of acmData.comparables) {
          const computed = resultado?.comparables?.find((r) => r.id === comp.id)?.detalle_factores ?? {}
          recoms[comp.id] = computed
          initial[comp.id] = {}
          for (const f of ALL_FACTORS) {
            initial[comp.id][f.key] = comp[f.key] ?? computed[f.key] ?? 1
          }
        }
        setFactorMap(initial)
        setRecommendMap(recoms)

        const hasActiveAdv = acmData.comparables.some(comp =>
          ADV_FACTORS.some(f => {
            const v = comp[f.key]
            return v != null && Math.abs(v - 1) > 0.001
          })
        )
        if (hasActiveAdv) setAdvancedMode(true)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  function handleChange(compId, factorKey, value) {
    setFactorMap((prev) => ({
      ...prev,
      [compId]: { ...prev[compId], [factorKey]: value },
    }))
  }

  async function handleCalcular() {
    setSaving(true)
    setError(null)
    try {
      for (const comp of comparables) {
        await updateComparable(id, comp.id, factorMap[comp.id] || {})
      }
      navigate(`/acm/${id}/step/4`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        eyebrow="Cargando ponderadores"
        title="Preparamos la mesa de ajustes"
        subtitle="Traemos comparables, recomendaciones del sistema y contexto del sujeto."
        messages={['Cargando comparables...', 'Preparando recomendaciones...', 'Abriendo mesa de ajustes...']}
        step="Paso 3 - Ponderadores"
      />
    )
  }

  if (error) {
    return (
      <StateCard
        eyebrow="No pudimos abrir los ponderadores"
        title="Faltan datos para continuar con el ajuste"
        description={error}
        tone="error"
        actions={<button className="btn btn-primary" onClick={() => navigate(`/acm/${id}/step/2`)}>Volver al paso 2</button>}
      />
    )
  }

  return (
    <div>
      <WizardNav currentStep={3} />
      <div className="step-header step-header--compact">
        <span className="page-eyebrow">Ajuste de comparables</span>
        <h1>Ponderadores</h1>
        <p>Calibrá cada comparable contra el sujeto y revisá el impacto del ajuste antes de calcular resultados.</p>
      </div>
      {error && (
        <InlineNotice
          tone="error"
          title="No pudimos actualizar los ponderadores"
          description={error}
          className="notice--spaced"
        />
      )}

      <div className="workflow-toolbar">
        <div className="workflow-toolbar__group">
          <span className="workflow-toolbar__label">Vista</span>
          <div className="factor-mode-switcher">
            {[
              { key: 'slider', title: 'Sliders', icon: '⟺' },
              { key: 'stepper', title: 'Ajuste fino', icon: '±' },
            ].map(({ key, title, icon }) => (
              <button
                key={key}
                type="button"
                title={title}
                className={`factor-mode-btn${inputMode === key ? ' is-active' : ''}`}
                onClick={() => handleInputModeChange(key)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
        <div className="workflow-toolbar__group">
          <span className="workflow-toolbar__label">Modo</span>
          <button
            className={`btn btn-sm ${advancedMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={async () => {
              if (advancedMode) {
                const hasActive = comparables.some(comp =>
                  ADV_FACTORS.some(f => Math.abs((factorMap[comp.id]?.[f.key] ?? 1) - 1) > 0.001)
                )
                if (hasActive) {
                  const accepted = await confirm({
                    tone: 'warning',
                    eyebrow: 'Modo avanzado',
                    title: 'Se van a reiniciar los factores avanzados',
                    description: 'Si desactivás este modo, cochera, pileta, luminosidad, vistas y amenities volverán a su valor base en todas las comparables.',
                    confirmLabel: 'Desactivar y reiniciar',
                    cancelLabel: 'Mantener modo avanzado',
                  })
                  if (!accepted) return
                  setFactorMap(prev => {
                    const next = { ...prev }
                    for (const comp of comparables) {
                      next[comp.id] = { ...next[comp.id] }
                      for (const f of ADV_FACTORS) next[comp.id][f.key] = 1
                    }
                    return next
                  })
                }
              }
              setAdvancedMode(v => !v)
            }}
          >
            {advancedMode ? 'Modo avanzado activo' : 'Activar modo avanzado'}
          </button>
        </div>
      </div>

      <div className="alert alert-info alert-info--compact ponderadores-note">
        Rojo: factor menor a <strong>1.000</strong>. Verde: factor mayor a <strong>1.000</strong>. La intensidad acompaña el tamaño del ajuste y la aguja sigue marcando la recomendación del sistema.
      </div>

      {advancedMode && (
        <div className="alert alert-info alert-info--compact">
          Factores adicionales habilitados para comparables especiales: cochera, pileta, luminosidad, vistas y amenities.
        </div>
      )}

      {comparables.map((comp) => (
        <ComparableCard
          key={comp.id}
          comp={comp}
          acm={acm}
          factors={factorMap[comp.id] || {}}
          recommendations={recommendMap[comp.id] || {}}
          advancedMode={advancedMode}
          inputMode={inputMode}
          onChange={(factorKey, value) => handleChange(comp.id, factorKey, value)}
        />
      ))}

      <div className="btn-group">
        <button className="btn btn-secondary" onClick={() => navigate(`/acm/${id}/step/2`)}>← Paso 2</button>
        <button className="btn btn-primary" onClick={handleCalcular} disabled={saving}>
          {saving && <span className="spinner" />}
          Calcular resultados →
        </button>
      </div>
    </div>
  )
}
