import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getACM } from '../../../api.js'
import { useWizard } from '../contexts/WizardContext.jsx'
import WizardNav from '../components/WizardNav.jsx'
import InlineNotice from '../../../components/InlineNotice.jsx'

function fmt(n) {
  return n != null ? `USD ${Math.round(n).toLocaleString('es-AR')}` : '—'
}

function fmtFactor(n) {
  return n != null ? n.toFixed(4) : '—'
}

function buildPDF(acm, resultado, chartB64, branding) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const primaryColor = branding?.primary_color || '#1a3a5c'
  const appName = branding?.app_name || 'ACM Real Estate'

  // Parse hex to RGB
  const hex = primaryColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Header bar
  doc.setFillColor(r, g, b)
  doc.rect(0, 0, W, 20, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(appName, 14, 13)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Análisis Comparativo de Mercado', W - 14, 13, { align: 'right' })

  // Title
  doc.setTextColor(r, g, b)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(acm.nombre || `ACM #${acm.id}`, 14, 32)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(acm.direccion || '', 14, 39)

  // Subject property details
  let y = 48
  doc.setFillColor(245, 247, 250)
  doc.rect(14, y - 4, W - 28, 24, 'F')
  doc.setTextColor(r, g, b)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PROPIEDAD SUJETO', 18, y + 1)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)

  const subjectFields = [
    ['Tipo', acm.tipo || '—'],
    ['Sup. cubierta', acm.superficie_cubierta ? `${acm.superficie_cubierta} m²` : '—'],
    ['Sup. semicubierta', acm.superficie_semicubierta ? `${acm.superficie_semicubierta} m²` : '—'],
    ['Piso', acm.piso != null ? String(acm.piso) : '—'],
    ['Antigüedad', acm.antiguedad != null ? `${acm.antiguedad} años` : '—'],
    ['Orientación', acm.orientacion || '—'],
    ['Estado', acm.estado || '—'],
    ['Calidad', acm.calidad || '—'],
  ]

  const colW = (W - 28) / 4
  subjectFields.forEach(([label, value], i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 18 + col * colW
    const yy = y + 8 + row * 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)
    doc.text(value, x, yy + 4)
  })

  // KPI section
  y = 82
  doc.setFillColor(r, g, b)
  doc.rect(14, y, W - 28, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('RESULTADOS', 18, y + 5.5)

  y += 12
  const kpis = [
    ['Promedio ajustado', `${fmt(resultado.mean_ajustado)}/m²`],
    ['Rango', `${fmt(resultado.min_ajustado)} — ${fmt(resultado.max_ajustado)}`],
    ['Valor estimado sujeto', fmt(resultado.valor_estimado_sujeto)],
  ]
  const kpiW = (W - 28) / kpis.length
  kpis.forEach(([label, value], i) => {
    const x = 14 + i * kpiW
    doc.setFillColor(248, 249, 252)
    doc.rect(x, y - 4, kpiW - 2, 18, 'F')
    doc.setTextColor(120, 120, 120)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(label.toUpperCase(), x + 4, y + 1)
    doc.setTextColor(r, g, b)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(value, x + 4, y + 10)
  })

  // Comparables table
  y += 22
  doc.setTextColor(r, g, b)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('TABLA DE COMPARABLES', 14, y)
  y += 4

  const tableRows = resultado.comparables.map((c) => [
    c.direccion || '—',
    fmt(c.precio),
    fmt(c.precio_m2_publicado),
    fmtFactor(c.factor_total),
    fmt(c.precio_ajustado_m2),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Dirección', 'Precio', 'Precio/m² pub.', 'Factor total', 'Precio ajust./m²']],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    margin: { left: 14, right: 14 },
  })

  // Chart image
  if (chartB64) {
    const finalY = doc.lastAutoTable?.finalY || 180
    const imgH = 60
    const availableSpace = doc.internal.pageSize.getHeight() - finalY - 20
    if (availableSpace < imgH + 12) {
      doc.addPage()
      doc.setFillColor(r, g, b)
      doc.rect(0, 0, W, 20, 'F')
    }
    const chartY = availableSpace < imgH + 12 ? 24 : finalY + 8
    doc.setTextColor(r, g, b)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('GRÁFICO DE PRECIOS AJUSTADOS', 14, chartY - 2)
    doc.addImage(chartB64, 'PNG', 14, chartY + 2, W - 28, imgH)
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setTextColor(160, 160, 160)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${appName} · Generado el ${new Date().toLocaleDateString('es-AR')} · Pág. ${i}/${pageCount}`,
      W / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' }
    )
  }

  return doc
}

export default function ExportarPDF() {
  const { id } = useParams()
  const { state, chartRef } = useWizard()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [acm, setAcm] = useState(null)
  const navigate = useNavigate()

  const resultado = state.resultado
  const blockedByApproval = acm?.requires_approval && acm?.approval_status !== 'Aprobado'

  useEffect(() => {
    getACM(id).then(setAcm).catch((e) => setError(e.message))
  }, [id])

  async function handleDownload() {
    if (blockedByApproval || !resultado || !acm) return
    setGenerating(true)
    setError(null)
    setSuccess(false)
    try {
      const chartB64 = chartRef.current?.getBase64() || null
      const doc = buildPDF(acm, resultado, chartB64, null)
      doc.save(`acm_${id}.pdf`)
      setSuccess(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <WizardNav currentStep={5} />
      <div className="step-header">
        <h1>Exportar Informe PDF</h1>
        <p>Descargá el informe completo del ACM en formato PDF.</p>
      </div>

      {!resultado && (
        <InlineNotice
          tone="warning"
          title="Todavía no hay resultados listos para exportar"
          description="Volvé al paso 4 para calcular el valor antes de generar el informe."
          className="notice--spaced"
        />
      )}

      {resultado && (
        <div className="card">
          <h2>Resumen de resultados</h2>
          {blockedByApproval && (
            <InlineNotice
              tone="warning"
              title="Esta tasación necesita aprobación antes de exportarse"
              description="Cuando quede aprobada, vas a poder generar el PDF desde esta misma pantalla."
              className="notice--spaced"
            >
              {acm?.approval_comments?.length > 0 && (
                <div className="pdf-approval-comments">
                  {acm.approval_comments.map((comment) => (
                    <div key={comment.id}>
                      <strong>{comment.section}:</strong> {comment.message}
                    </div>
                  ))}
                </div>
              )}
            </InlineNotice>
          )}
          <div className="pdf-summary-grid">
            <div className="pdf-summary-card">
              <div className="pdf-summary-card__label">Promedio ajustado</div>
              <div className="pdf-summary-card__value">{fmt(resultado.mean_ajustado)}<span>/m²</span></div>
            </div>
            <div className="pdf-summary-card">
              <div className="pdf-summary-card__label">Rango</div>
              <div className="pdf-summary-card__text">
                {fmt(resultado.min_ajustado)} — {fmt(resultado.max_ajustado)}
              </div>
            </div>
            <div className="pdf-summary-card">
              <div className="pdf-summary-card__label">Valor estimado sujeto</div>
              <div className="pdf-summary-card__value">{fmt(resultado.valor_estimado_sujeto)}</div>
            </div>
          </div>

          <p className="pdf-summary-note">
            El PDF incluye la ficha de la propiedad sujeto, la tabla de comparables con sus ponderadores,
            los KPIs de la tasación y el gráfico de precios ajustados.
          </p>

          {error && <InlineNotice tone="error" title="No pudimos generar el PDF" description={error} className="notice--spaced" />}
          {success && <div className="alert alert-success">PDF descargado correctamente.</div>}

          <button className="btn btn-primary" onClick={handleDownload} disabled={generating || blockedByApproval}>
            {generating && <span className="spinner" />}
            {generating ? 'Generando PDF...' : blockedByApproval ? 'Pendiente de aprobación' : 'Descargar PDF'}
          </button>
        </div>
      )}

      <div className="btn-group">
        <button className="btn btn-secondary" onClick={() => navigate(`/acm/${id}/step/4`)}>← Paso 4</button>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Ir al inicio</button>
      </div>
    </div>
  )
}
