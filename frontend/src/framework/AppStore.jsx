import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useModules } from './useModules.js'
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function apiRequest(method, path, body) {
  const token = localStorage.getItem('acm_token') || ''
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try { detail = (await res.json()).detail ?? detail } catch {}
    throw new Error(detail)
  }
  if (res.status === 204) return null
  return res.json()
}

const CATEGORY_LABELS = {
  core: 'Core',
  productivity: 'Productividad',
  integration: 'Integraciones',
}

function ModuleCard({ module, installed, unlocked, onInstall, onUninstall, onRequest, loading }) {
  const isLoading = loading === module.id

  return (
    <div className={`appstore-card${installed ? ' is-installed' : ''}${!unlocked ? ' is-locked' : ''}`}>
      <div className="appstore-card__header">
        <div className="appstore-card__icon-wrap">
          <span className="appstore-card__icon">{module.name.slice(0, 2).toUpperCase()}</span>
        </div>
        <div className="appstore-card__meta">
          <strong className="appstore-card__name">{module.name}</strong>
          <span className="appstore-card__version">v{module.version}</span>
        </div>
        {installed && <span className="appstore-card__badge appstore-card__badge--installed">Instalado</span>}
        {!installed && unlocked && <span className="appstore-card__badge appstore-card__badge--unlocked">Disponible</span>}
        {!unlocked && <span className="appstore-card__badge appstore-card__badge--locked">Bloqueado</span>}
      </div>

      <p className="appstore-card__desc">{module.description}</p>

      {module.dependencies.length > 0 && (
        <div className="appstore-card__deps">
          <span className="appstore-card__deps-label">Requiere: </span>
          {module.dependencies.join(', ')}
        </div>
      )}

      <div className="appstore-card__actions">
        {installed && (
          <button
            className="btn btn--sm btn--danger-ghost"
            onClick={() => onUninstall(module.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Desinstalando…' : 'Desinstalar'}
          </button>
        )}
        {!installed && unlocked && (
          <button
            className="btn btn--sm btn--primary"
            onClick={() => onInstall(module.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Instalando…' : 'Instalar'}
          </button>
        )}
        {!unlocked && (
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => onRequest(module.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Solicitando…' : 'Solicitar acceso'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function AppStore() {
  const { user } = useAuth()
  const registry = useModules()
  const [installed, setInstalled] = useState([])
  const [unlocked, setUnlocked] = useState([])
  const [loading, setLoading] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const catalog = registry.getCatalog()

  useEffect(() => {
    apiRequest('GET', '/api/modules').then((data) => {
      setInstalled(data.installed || [])
      setUnlocked(data.unlocked || [])
    })
  }, [])

  function showFeedback(msg, type = 'success') {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleInstall(moduleId) {
    setLoading(moduleId)
    try {
      await apiRequest('POST', `/api/modules/${moduleId}/install`)
      setInstalled((prev) => [...prev, moduleId])
      registry.hydrate([...installed, moduleId])
      showFeedback('Módulo instalado correctamente')
    } catch (e) {
      showFeedback(e.message || 'Error al instalar', 'error')
    } finally {
      setLoading(null)
    }
  }

  async function handleUninstall(moduleId) {
    setLoading(moduleId)
    try {
      await apiRequest('DELETE', `/api/modules/${moduleId}`)
      const next = installed.filter((id) => id !== moduleId)
      setInstalled(next)
      registry.hydrate(next)
      showFeedback('Módulo desinstalado')
    } catch (e) {
      showFeedback(e.message || 'Error al desinstalar', 'error')
    } finally {
      setLoading(null)
    }
  }

  async function handleRequest(moduleId) {
    setLoading(moduleId)
    try {
      await apiRequest('POST', `/api/modules/${moduleId}/request-unlock`)
      showFeedback('Solicitud enviada al administrador')
    } catch (e) {
      showFeedback(e.message || 'Error al enviar solicitud', 'error')
    } finally {
      setLoading(null)
    }
  }

  const byCategory = catalog.reduce((acc, m) => {
    const cat = m.category || 'core'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(m)
    return acc
  }, {})

  return (
    <div className="appstore">
      <div className="appstore__header">
        <h1 className="appstore__title">App Store</h1>
        <p className="appstore__subtitle">Instalá y gestioná los módulos disponibles para tu empresa.</p>
      </div>

      {feedback && (
        <div className={`appstore__feedback appstore__feedback--${feedback.type}`}>
          {feedback.msg}
        </div>
      )}

      {Object.entries(byCategory).map(([cat, modules]) => (
        <section key={cat} className="appstore__section">
          <h2 className="appstore__section-title">{CATEGORY_LABELS[cat] ?? cat}</h2>
          <div className="appstore__grid">
            {modules.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                installed={installed.includes(m.id)}
                unlocked={unlocked.includes(m.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onRequest={handleRequest}
                loading={loading}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
