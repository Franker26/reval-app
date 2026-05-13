import React from 'react'

export default function DashboardPlaceholderStack({ variant = 'focus' }) {
  const rows = variant === 'focus'
    ? [
        { title: 'Tasación Puerto Madero', meta: 'Carga y ajuste en curso', side: 'Pendiente', chips: ['3 comparables', 'Actualizado hoy'] },
        { title: 'Tasación Palermo', meta: 'Documentación en revisión', side: 'En curso', chips: ['2 comparables', 'Seguimiento'] },
      ]
    : [
        { title: 'Tasación Belgrano', meta: 'Analista senior · 4 comparables', side: 'Pendiente', chips: ['Revisión', 'Prioridad media'] },
        { title: 'Tasación Núñez', meta: 'Broker interno · 2 comparables', side: 'Pendiente', chips: ['Cola', 'Siguiente'] },
      ]

  return (
    <div className="dashboard-placeholder-stack" aria-hidden="true">
      <div className="dashboard-placeholder-stack__rail">
        {rows.map((row, index) => (
          <div
            key={`${variant}-${row.title}`}
            className={`dashboard-placeholder-card${index === 1 ? ' is-secondary' : ''}`}
          >
            <div className="dashboard-placeholder-card__top">
              <div className="dashboard-placeholder-card__copy">
                <strong>{row.title}</strong>
                <p>{row.meta}</p>
              </div>
              <span className="dashboard-placeholder-card__badge">{row.side}</span>
            </div>
            <div className="dashboard-placeholder-card__meta">
              {row.chips.map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
