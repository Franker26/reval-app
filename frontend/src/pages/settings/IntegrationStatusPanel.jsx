import React, { useEffect, useState } from 'react'
import InlineNotice from '../../components/InlineNotice.jsx'
import { getIntegrationStatus } from '../../api.js'
import { SectionTitle } from './shared.jsx'

export default function IntegrationStatusPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getIntegrationStatus().then(setData).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <SectionTitle>Estado de integraciones</SectionTitle>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13 }}>
        La configuración de integraciones es administrada por el equipo de soporte.
      </p>
      {error && <InlineNotice tone="error" title="No pudimos revisar las integraciones" description={error} className="notice--spaced" />}

      {!data ? (
        <span className="spinner" />
      ) : (
        <div className="integration-status-grid">
          {data.sources.map((source) => (
            <div key={source.key} className="integration-card">
              <div className="integration-card__header">
                <span className={`integration-card__dot integration-card__dot--${source.available ? 'ok' : 'error'}`} />
                <span className="integration-card__name">{source.name}</span>
              </div>
              <div className="integration-card__detail">
                <span className={`integration-card__status-label integration-card__status-label--${source.available ? 'ok' : 'error'}`}>
                  {source.available ? 'Disponible' : 'No disponible'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
