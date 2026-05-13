import React, { useEffect, useRef, useState } from 'react'
import InlineNotice from '../../components/InlineNotice.jsx'
import { getBrandingSettings, updateBrandingSettings } from '../../api.js'
import { applyTheme, getCachedBrandingPayload, syncBranding } from '../../theme.js'
import { SectionTitle } from './shared.jsx'

export default function ThemePanel() {
  const [branding, setBranding] = useState(() => getCachedBrandingPayload())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getBrandingSettings().then(setBranding).catch((e) => setError(e.message))
  }, [])

  function handleColorChange(e) {
    const color = e.target.value
    setBranding((prev) => ({ ...prev, primary_color: color }))
    applyTheme(color)
  }

  function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setBranding((prev) => ({ ...prev, logo_data_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const saved = await updateBrandingSettings(branding)
      setBranding(saved)
      syncBranding(saved)
      window.dispatchEvent(new Event('acm_theme_changed'))
      setMessage('Branding actualizado.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionTitle>Personalización</SectionTitle>
      {error && <InlineNotice tone="error" title="No pudimos guardar la marca" description={error} className="notice--spaced" />}
      {message && <div className="alert alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="settings-group">
        <div className="settings-group-header">Nombre de la aplicación</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: 13 }}>
            Se refleja en el header, la pantalla de login y el PDF exportado.
          </p>
          <input
            type="text"
            value={branding.app_name || ''}
            onChange={(e) => setBranding((prev) => ({ ...prev, app_name: e.target.value }))}
            style={{ maxWidth: 320 }}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Color principal</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            Actualiza el tono dominante de toda la interfaz en tiempo real.
          </p>
          <div className="settings-color-row">
            <input
              type="color"
              value={branding.primary_color || '#1a3a5c'}
              onChange={handleColorChange}
              className="settings-color-picker"
            />
            <span className="settings-color-value">{branding.primary_color}</span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Logotipo</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            Mantené la misma línea visual entre la landing, el workspace y el reporte.
          </p>
          {branding.logo_data_url && (
            <div className="settings-logo-preview" style={{ marginBottom: 12 }}>
              <img src={branding.logo_data_url} alt="Logo actual" className="settings-logo-preview__image" />
            </div>
          )}
          <div className="settings-actions-row">
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              {branding.logo_data_url ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {branding.logo_data_url && (
              <button className="btn btn-danger btn-sm"
                onClick={() => setBranding((prev) => ({ ...prev, logo_data_url: null }))}>
                Quitar logo
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
        </div>
      </div>

      <div style={{ padding: '0 0 8px' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <span className="spinner" />}
          Guardar branding
        </button>
      </div>
    </div>
  )
}
