import React, { useState } from 'react'
import {
  createIcalFeed,
  deleteIcalFeed,
  disconnectGoogle,
  getGoogleAuthUrl,
  syncGoogle,
} from '../../../api.js'
import InlineNotice from '../../../components/InlineNotice.jsx'

export default function IntegrationsPanel({ integrations, available, onRefresh }) {
  const [loadingAction, setLoadingAction] = useState(null)
  const [error, setError] = useState(null)
  const [syncResult, setSyncResult] = useState(null)
  const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

  async function act(label, fn) {
    setLoadingAction(label)
    setError(null)
    setSyncResult(null)
    try {
      const result = await fn()
      onRefresh()
      return result
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleGoogleConnect() {
    await act('google-connect', async () => {
      const data = await getGoogleAuthUrl()
      window.location.href = data.url
    })
  }

  async function handleGoogleSync() {
    const result = await act('google-sync', syncGoogle)
    if (result) setSyncResult(`Google Calendar sincronizado: ${result.pushed} enviados y ${result.pulled} importados.`)
  }

  async function handleIcalCreate() {
    await act('ical-create', createIcalFeed)
  }

  async function handleIcalDelete() {
    await act('ical-delete', deleteIcalFeed)
  }

  async function handleGoogleDisconnect() {
    await act('google-disconnect', disconnectGoogle)
  }

  const googleConnected = Boolean(integrations?.google?.connected)
  const icalConnected = Boolean(integrations?.ical?.connected)
  const icalToken = integrations?.ical?.token
  const icalFeedUrl = icalToken ? `${API_BASE}/api/agenda/ical/${icalToken}` : null

  return (
    <section className="agenda-side-card agenda-side-card--integrations">
      <div className="agenda-side-card__header">
        <span className="home-panel__eyebrow">Sincronización</span>
        <strong>Calendarios externos</strong>
        <p>Conectá proveedores para compartir disponibilidad o mantener copias de seguridad fuera del workspace.</p>
      </div>

      {error ? (
        <InlineNotice
          tone="error"
          title="No pudimos completar la acción"
          description={error}
          compact
        />
      ) : null}

      {syncResult ? (
        <InlineNotice
          tone="success"
          title="Sincronización completa"
          description={syncResult}
          compact
        />
      ) : null}

      <div className="agenda-integrations__list">
        {(available?.google || googleConnected) ? (
          <div className="agenda-integration-card">
            <div className="agenda-integration-card__icon agenda-integration-card__icon--google">G</div>
            <div className="agenda-integration-card__body">
              <strong>Google Calendar</strong>
              <span>{googleConnected ? 'Cuenta conectada y lista para sincronizar manualmente.' : 'Disponible para conectar desde este workspace.'}</span>
            </div>
            <div className="agenda-integration-card__actions">
              {googleConnected ? (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleGoogleSync} disabled={Boolean(loadingAction)}>
                    {loadingAction === 'google-sync' ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleGoogleDisconnect} disabled={Boolean(loadingAction)}>
                    Desconectar
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={handleGoogleConnect} disabled={Boolean(loadingAction)}>
                  {loadingAction === 'google-connect' ? 'Redirigiendo...' : 'Conectar'}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="agenda-integration-card">
          <div className="agenda-integration-card__icon agenda-integration-card__icon--apple">A</div>
          <div className="agenda-integration-card__body">
            <strong>Apple Calendar</strong>
            <span>{icalConnected ? 'Feed activo para suscripción externa.' : 'Generá un feed iCal para compartir eventos.'}</span>
            {icalFeedUrl ? (
              <a href={`webcal://${icalFeedUrl.replace(/^https?:\/\//, '')}`} className="agenda-ical-link">
                Suscribirse con Apple Calendar
              </a>
            ) : null}
          </div>
          <div className="agenda-integration-card__actions">
            {icalConnected ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigator.clipboard.writeText(icalFeedUrl)}
                >
                  Copiar URL
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleIcalDelete} disabled={Boolean(loadingAction)}>
                  Revocar
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleIcalCreate} disabled={Boolean(loadingAction)}>
                {loadingAction === 'ical-create' ? 'Generando...' : 'Generar feed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
