import React, { useEffect, useState } from 'react'
import InlineNotice from '../../components/InlineNotice.jsx'
import { getSystemParams } from '../../api.js'
import { SectionTitle } from './shared.jsx'

export default function SystemParamsPanel() {
  const [params, setParams] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSystemParams().then(setParams).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <SectionTitle>Parámetros del sistema</SectionTitle>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
        Todos los valores almacenados en la tabla <code>app_settings</code>. Los valores sensibles aparecen enmascarados.
      </p>
      {error && <InlineNotice tone="error" title="No pudimos cargar los parámetros" description={error} className="notice--spaced" />}

      {!params ? (
        <span className="spinner" />
      ) : params.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay parámetros configurados aún.</p>
      ) : (
        <div className="settings-group" style={{ padding: 0 }}>
          <table className="params-table">
            <thead>
              <tr>
                <th>Clave</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.key}>
                  <td><code className="params-table__key">{p.key}</code></td>
                  <td className="params-table__value">{p.value || <em style={{ color: 'var(--text-muted)' }}>vacío</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
