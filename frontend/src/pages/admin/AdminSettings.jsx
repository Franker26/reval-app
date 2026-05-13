import React, { useEffect, useState } from 'react'
import {
  adminCheckIntegrationStatus,
  adminGetCalendarSettings,
  adminGetIntegrationSettings,
  adminUpdateCalendarSettings,
  adminUpdateIntegrationSettings,
} from '../../adminApi.js'
import { LoadingState } from '../../components/StatusState.jsx'
import InlineNotice from '../../components/InlineNotice.jsx'

const SOURCE_LABELS = {
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
}

const EMPTY = {
  scraper_service_url: '',
  scraper_service_token: '',
  scraper_service_url_backup: '',
  scraper_service_token_backup: '',
}

function nodeFromRaw(data) {
  return {
    scraper_service_url: data.scraper_service_url || '',
    scraper_service_token: data.scraper_service_token === '***' ? '***' : (data.scraper_service_token || ''),
    scraper_service_url_backup: data.scraper_service_url_backup || '',
    scraper_service_token_backup: data.scraper_service_token_backup === '***' ? '***' : (data.scraper_service_token_backup || ''),
  }
}

function ServerStatus({ label, info }) {
  if (!info) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className={`integration-card__dot integration-card__dot--${info.connected ? 'ok' : 'error'}`} />
      <span style={{ fontWeight: 500 }}>{label}</span>
      {info.url && <span style={{ color: '#888', fontSize: '0.8rem' }}>{info.url}</span>}
      <span style={{ color: info.connected ? 'var(--color-success, #1a8a4a)' : '#c00', fontSize: '0.82rem' }}>
        {info.connected ? 'Conectado' : 'Sin conexión'}
      </span>
    </div>
  )
}

const CAL_EMPTY = {
  google_client_id: '',
  google_client_secret: '',
  microsoft_client_id: '',
  microsoft_client_secret: '',
  ical_base_url: '',
}

function CalendarSyncCard() {
  const [settings, setSettings] = useState(CAL_EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    adminGetCalendarSettings()
      .then((data) => setSettings({
        google_client_id: data.google_client_id || '',
        google_client_secret: data.google_client_secret || '',
        microsoft_client_id: data.microsoft_client_id || '',
        microsoft_client_secret: data.microsoft_client_secret || '',
        ical_base_url: data.ical_base_url || '',
      }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function set(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        google_client_id: settings.google_client_id.trim() || null,
        google_client_secret: settings.google_client_secret === '***' ? '***' : (settings.google_client_secret.trim() || null),
        microsoft_client_id: settings.microsoft_client_id.trim() || null,
        microsoft_client_secret: settings.microsoft_client_secret === '***' ? '***' : (settings.microsoft_client_secret.trim() || null),
        ical_base_url: settings.ical_base_url.trim() || null,
      }
      await adminUpdateCalendarSettings(payload)
      setSuccess('Configuración guardada.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 640, marginTop: '1.5rem' }}>
      <h2 className="admin-card__title">Sincronización de calendario</h2>
      <p className="admin-card__desc">
        Credenciales OAuth para que los usuarios puedan conectar Google Calendar y Microsoft Outlook.
        La URL base de iCal se usa para generar los enlaces de exportación de agenda.
      </p>

      {loading ? (
        <LoadingState
          eyebrow="Admin"
          title="Cargando configuración de calendario"
          subtitle=""
          messages={['Cargando...']}
          mode="inline"
        />
      ) : (
        <form onSubmit={handleSave} className="admin-form">
          <p className="admin-form__section-label">Google Calendar</p>
          <div className="admin-form__field">
            <label className="admin-form__label">Client ID</label>
            <input
              className="admin-input"
              type="text"
              placeholder="xxx.apps.googleusercontent.com"
              value={settings.google_client_id}
              onChange={(e) => set('google_client_id', e.target.value)}
            />
          </div>
          <div className="admin-form__field">
            <label className="admin-form__label">Client Secret</label>
            <input
              className="admin-input"
              type="password"
              placeholder={settings.google_client_secret === '***' ? '(guardado)' : 'GOCSPX-...'}
              value={settings.google_client_secret === '***' ? '' : settings.google_client_secret}
              onChange={(e) => set('google_client_secret', e.target.value)}
            />
          </div>

          <p className="admin-form__section-label" style={{ marginTop: '1.25rem' }}>Microsoft Outlook</p>
          <div className="admin-form__field">
            <label className="admin-form__label">Client ID</label>
            <input
              className="admin-input"
              type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={settings.microsoft_client_id}
              onChange={(e) => set('microsoft_client_id', e.target.value)}
            />
          </div>
          <div className="admin-form__field">
            <label className="admin-form__label">Client Secret</label>
            <input
              className="admin-input"
              type="password"
              placeholder={settings.microsoft_client_secret === '***' ? '(guardado)' : 'Valor del secreto de cliente'}
              value={settings.microsoft_client_secret === '***' ? '' : settings.microsoft_client_secret}
              onChange={(e) => set('microsoft_client_secret', e.target.value)}
            />
          </div>

          <p className="admin-form__section-label" style={{ marginTop: '1.25rem' }}>iCal</p>
          <div className="admin-form__field">
            <label className="admin-form__label">URL base de la plataforma</label>
            <input
              className="admin-input"
              type="url"
              placeholder="https://tuapp.com"
              value={settings.ical_base_url}
              onChange={(e) => set('ical_base_url', e.target.value)}
            />
          </div>

          {error && <InlineNotice tone="error" title="No pudimos guardar" description={error} className="notice--spaced" compact />}
          {success && <InlineNotice tone="success" title="Configuración actualizada" description={success} className="notice--spaced" compact />}

          <div className="admin-form__actions">
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(EMPTY)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGetIntegrationSettings()
      setSettings(nodeFromRaw(data))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        scraper_service_url: settings.scraper_service_url.trim() || null,
        scraper_service_token:
          settings.scraper_service_token === '***' ? '***' : settings.scraper_service_token.trim() || null,
        scraper_service_url_backup: settings.scraper_service_url_backup.trim() || null,
        scraper_service_token_backup:
          settings.scraper_service_token_backup === '***' ? '***' : settings.scraper_service_token_backup.trim() || null,
      }
      const updated = await adminUpdateIntegrationSettings(payload)
      setSettings(nodeFromRaw(updated))
      setSuccess('Configuración guardada.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCheck() {
    setChecking(true)
    setError(null)
    setStatus(null)
    try {
      const data = await adminCheckIntegrationStatus()
      setStatus(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setChecking(false)
    }
  }

  function set(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Configuración de la plataforma</h1>
      </div>

      <CalendarSyncCard />

      <div className="admin-card" style={{ maxWidth: 640, marginTop: '1.5rem' }}>
        <h2 className="admin-card__title">Microservicio scraper</h2>
        <p className="admin-card__desc">
          Zonaprop, Argenprop y MercadoLibre usan este servicio centralizado.
          Si el servidor principal no responde, el sistema reintenta automáticamente con el backup.
        </p>

        {loading ? (
          <LoadingState
            eyebrow="Admin"
            title="Estamos cargando la configuración"
            subtitle="Recuperamos el estado del scraper principal y del backup para que puedas revisar la integración."
            messages={['Cargando configuración...', 'Leyendo credenciales...', 'Validando estado del servicio...']}
            mode="inline"
          />
        ) : (
          <form onSubmit={handleSave} className="admin-form">

            <p className="admin-form__section-label">Servidor principal</p>
            <div className="admin-form__field">
              <label className="admin-form__label">URL</label>
              <input
                className="admin-input"
                type="url"
                placeholder="https://scraper-principal.ejemplo.com"
                value={settings.scraper_service_url}
                onChange={(e) => set('scraper_service_url', e.target.value)}
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Token</label>
              <input
                className="admin-input"
                type="password"
                placeholder={settings.scraper_service_token === '***' ? '(guardado)' : 'Token Bearer'}
                value={settings.scraper_service_token === '***' ? '' : settings.scraper_service_token}
                onChange={(e) => set('scraper_service_token', e.target.value)}
              />
            </div>

            <p className="admin-form__section-label" style={{ marginTop: '1.25rem' }}>Servidor de backup</p>
            <div className="admin-form__field">
              <label className="admin-form__label">URL</label>
              <input
                className="admin-input"
                type="url"
                placeholder="https://scraper-backup.ejemplo.com"
                value={settings.scraper_service_url_backup}
                onChange={(e) => set('scraper_service_url_backup', e.target.value)}
              />
            </div>
            <div className="admin-form__field">
              <label className="admin-form__label">Token</label>
              <input
                className="admin-input"
                type="password"
                placeholder={settings.scraper_service_token_backup === '***' ? '(guardado)' : 'Token Bearer'}
                value={settings.scraper_service_token_backup === '***' ? '' : settings.scraper_service_token_backup}
                onChange={(e) => set('scraper_service_token_backup', e.target.value)}
              />
            </div>

            {error && <InlineNotice tone="error" title="No pudimos guardar la configuración" description={error} className="notice--spaced" compact />}
            {success && <InlineNotice tone="success" title="Configuración actualizada" description={success} className="notice--spaced" compact />}

            <div className="admin-form__actions">
              <button type="submit" className="admin-btn" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={handleCheck}
                disabled={checking || !settings.scraper_service_url.trim()}
              >
                {checking ? 'Verificando…' : 'Verificar conexión'}
              </button>
            </div>
          </form>
        )}

        {status && (
          <div className="admin-status-panel" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <ServerStatus label="Principal" info={status.primary} />
            {status.backup?.url && <ServerStatus label="Backup" info={status.backup} />}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {(status.sources || []).map((key) => (
                <span key={key} className="settings-badge settings-badge--admin" style={{ fontSize: '0.78rem' }}>
                  {SOURCE_LABELS[key] || key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
