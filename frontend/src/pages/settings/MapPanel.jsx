import React, { useState } from 'react'
import { SectionTitle } from './shared.jsx'

const OSM_KEY = 'acm_osm_enabled'

export default function MapPanel() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(OSM_KEY) !== 'false')

  function toggle() {
    const next = !enabled
    localStorage.setItem(OSM_KEY, String(next))
    setEnabled(next)
  }

  return (
    <div>
      <SectionTitle>OpenStreetMap</SectionTitle>
      <div className="settings-group">
        <div className="settings-group-header">Autocompletar direcciones</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            Cuando está activo, los campos de dirección sugieren resultados usando OpenStreetMap Nominatim.
          </p>
          <div className="settings-switch-row">
            <button
              onClick={toggle}
              className={`settings-switch${enabled ? ' settings-switch--enabled' : ''}`}
              aria-pressed={enabled}
            >
              <span className="settings-switch__thumb" />
            </button>
            <span className="settings-switch__label">{enabled ? 'Activado' : 'Desactivado'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
