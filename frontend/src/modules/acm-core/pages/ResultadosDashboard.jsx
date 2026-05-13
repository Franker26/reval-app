import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getACM, getResultado } from '../../../api.js'
import { useWizard } from '../contexts/WizardContext.jsx'
import WizardNav from '../components/WizardNav.jsx'
import KPICard from '../../../components/KPICard.jsx'
import PriceChart from '../../../components/PriceChart.jsx'
import { LoadingState, StateCard } from '../../../components/StatusState.jsx'

function fmtUSD(n) {
  return n != null ? `USD ${Math.round(n).toLocaleString('es-AR')}` : '—'
}

function fmtM2(n) {
  return n != null ? `USD ${Math.round(n).toLocaleString('es-AR')}/m²` : '—'
}

function confidenceLabel(cv) {
  if (cv < 5) return { label: 'Alta', color: '#2e7d32', bg: '#e8f5e9' }
  if (cv < 10) return { label: 'Media', color: '#e65100', bg: '#fff3e0' }
  return { label: 'Baja', color: '#c62828', bg: '#ffebee' }
}

export default function ResultadosDashboard() {
  const { id } = useParams()
  const [resultado, setResultado] = useState(null)
  const [acm, setAcm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { dispatch, chartRef } = useWizard()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([getResultado(id), getACM(id)])
      .then(([r, a]) => {
        setResultado(r)
        setAcm(a)
        dispatch({ type: 'SET_RESULTADO', payload: r })
        dispatch({ type: 'SET_ACM_ID', payload: a.id })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <LoadingState
        eyebrow="Calculando resultados"
        title="Estamos estimando el valor del sujeto"
        subtitle="Ponderamos comparables, ajustamos factores y validamos el rango final."
        messages={['Calculando...', 'Ponderando comparables...', 'Ajustando factores...', 'Validando rango...']}
        step="Paso 4 - Resultados"
      />
    )
  }

  if (error) {
    return (
      <StateCard
        eyebrow="No pudimos calcular el resultado"
        title="Se produjo un error al cargar esta tasación"
        description={error}
        tone="error"
        actions={<button className="btn btn-primary" onClick={() => navigate(`/acm/${id}/step/3`)}>Volver al paso 3</button>}
      />
    )
  }
  if (!resultado || !acm) return null

  const {
    mean_ajustado, median_ajustado, std_ajustado,
    min_ajustado, max_ajustado, valor_estimado_sujeto, comparables,
  } = resultado

  const supHomo = acm.superficie_cubierta
    + 0.5 * (acm.superficie_semicubierta || 0)
    + 0.3 * (acm.superficie_descubierta || 0)

  const cv = mean_ajustado > 0 ? (std_ajustado / mean_ajustado) * 100 : 0
  const conf = confidenceLabel(cv)
  const valorMin = (mean_ajustado - std_ajustado) * supHomo
  const valorMax = (mean_ajustado + std_ajustado) * supHomo
  const rango_m2 = max_ajustado - min_ajustado

  return (
    <div>
      <WizardNav currentStep={4} />
      <div className="step-header">
        <span className="page-eyebrow">Paso 4</span>
        <h1>Resultados</h1>
        <p>
          Estimación basada en <strong>{comparables.length} comparable{comparables.length !== 1 ? 's' : ''}</strong> ajustada{comparables.length !== 1 ? 's' : ''}.
          {' '}Superficie homogeneizada del sujeto: <strong>{supHomo.toFixed(2)} m²</strong>.
        </p>
      </div>

      {/* Valor estimado principal + confiabilidad */}
      <div className="kpi-hero-row">
        <div className="kpi-hero">
          <div className="kpi-hero-label">Valor estimado del sujeto</div>
          <div className="kpi-hero-value">{fmtUSD(valor_estimado_sujeto)}</div>
          <div className="kpi-hero-sub">
            Rango ±1σ: {fmtUSD(valorMin)} — {fmtUSD(valorMax)}
          </div>
        </div>
        <div
          className="kpi-confidence"
          style={{ background: conf.bg, color: conf.color, border: `1.5px solid ${conf.color}` }}
          title={`Coeficiente de variación: ${cv.toFixed(1)}%`}
        >
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Confiabilidad</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{conf.label}</div>
          <div style={{ fontSize: 11, opacity: .75 }}>CV {cv.toFixed(1)}%</div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid results-kpi-grid">
        <KPICard
          label="Promedio ajustado"
          value={fmtM2(mean_ajustado)}
          highlight
          tooltip="Promedio aritmético del precio/m² de las comparables después de aplicar todos los factores de ajuste."
        />
        <KPICard
          label="Mediana ajustada"
          value={fmtM2(median_ajustado)}
          tooltip="Valor central del conjunto ajustado. Menos sensible a comparables atípicas que el promedio."
        />
        <KPICard
          label="Sup. homogeneizada"
          value={`${supHomo.toFixed(2)} m²`}
          tooltip={`Superficie ponderada del sujeto: ${acm.superficie_cubierta} cub. + 0.5×${acm.superficie_semicubierta||0} semi + 0.3×${acm.superficie_descubierta||0} desc.`}
          sub={`${acm.tipo}`}
        />
        <KPICard
          label="Mínimo ajustado"
          value={fmtM2(min_ajustado)}
          tooltip="Precio/m² ajustado más bajo del conjunto de comparables."
        />
        <KPICard
          label="Máximo ajustado"
          value={fmtM2(max_ajustado)}
          tooltip="Precio/m² ajustado más alto del conjunto de comparables."
        />
        <KPICard
          label="Rango del mercado"
          value={fmtM2(rango_m2)}
          tooltip="Spread entre el máximo y el mínimo ajustado. Indica la amplitud de precios en el mercado analizado."
          sub={`${comparables.length} comparables · σ ${fmtM2(std_ajustado)}`}
        />
      </div>

      <div className="results-mobile-comparables">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Comparables</span>
            <h2>Lectura rápida del mercado</h2>
          </div>
        </div>
        <div className="results-mobile-comparables__list">
          {comparables.map((c, i) => (
            <article key={c.id} className="results-mobile-card">
              <div className="results-mobile-card__top">
                <div>
                  <strong>{c.direccion || c.url?.slice(0, 32) || `Comparable ${i + 1}`}</strong>
                  <span>{fmtUSD(c.precio)} · {fmtM2(c.precio_m2_publicado)}</span>
                </div>
                <div className="results-mobile-card__factor">{c.factor_total.toFixed(3)}</div>
              </div>
              <div className="results-mobile-card__bottom">
                <div>
                  <span>Ajustado</span>
                  <strong>{fmtM2(c.precio_ajustado_m2)}</strong>
                </div>
                <div>
                  <span>Total estimado</span>
                  <strong>{fmtUSD(c.precio_ajustado_m2 * supHomo)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Tabla comparables */}
      <div className="card workflow-card">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Detalle</span>
            <h2>Comparables ajustadas</h2>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Comparable</th>
                <th>Precio USD</th>
                <th>USD/m² pub.</th>
                <th>Factor total</th>
                <th>USD/m² ajust.</th>
                <th>Valor total est.</th>
              </tr>
            </thead>
            <tbody>
              {comparables.map((c, i) => {
                const dev = Math.abs(c.factor_total - 1)
                const fColor = dev < 0.05 ? '#2e7d32' : dev < 0.15 ? '#e65100' : '#c62828'
                return (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.direccion || c.url?.slice(0, 40) || `#${i + 1}`}</td>
                    <td>USD {c.precio.toLocaleString('es-AR')}</td>
                    <td>USD {Math.round(c.precio_m2_publicado).toLocaleString('es-AR')}</td>
                    <td><span style={{ fontWeight: 600, color: fColor }}>{c.factor_total.toFixed(3)}</span></td>
                    <td><strong>USD {Math.round(c.precio_ajustado_m2).toLocaleString('es-AR')}</strong></td>
                    <td style={{ color: '#555' }}>
                      USD {Math.round(c.precio_ajustado_m2 * supHomo).toLocaleString('es-AR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card workflow-card">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Distribución</span>
            <h2>Gráfico de precios ajustados</h2>
          </div>
        </div>
        <PriceChart ref={chartRef} comparables={comparables} mean={mean_ajustado} />
      </div>

      <div className="btn-group">
        <button className="btn btn-secondary" onClick={() => navigate(`/acm/${id}/step/3`)}>← Paso 3</button>
        <button className="btn btn-primary" onClick={() => navigate(`/acm/${id}/step/5`)}>
          Exportar PDF →
        </button>
      </div>
    </div>
  )
}
