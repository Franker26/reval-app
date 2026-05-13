import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import { avatarColor, initials } from '../utils/avatars.js'
import UsersPanel from './settings/UsersPanel.jsx'
import ThemePanel from './settings/ThemePanel.jsx'
import MapPanel from './settings/MapPanel.jsx'
import IntegrationStatusPanel from './settings/IntegrationStatusPanel.jsx'
import SystemParamsPanel from './settings/SystemParamsPanel.jsx'
import ModifiersPanel from './settings/ModifiersPanel.jsx'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const debugMode = new URLSearchParams(location.search).get('debug') === '1'
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 820
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 820)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const topSections = [
    { key: 'config', label: 'Configuración general' },
    user?.is_admin ? { key: 'usuarios', label: 'Usuarios' } : null,
    (debugMode && user?.is_admin) ? { key: 'tecnico', label: 'Técnico' } : null,
  ].filter(Boolean)

  const sidebarMap = {
    config: [
      { key: 'mapa', label: 'OpenStreetMap' },
      user?.is_admin ? { key: 'personalizacion', label: 'Personalización' } : null,
      user?.is_admin ? { key: 'integraciones', label: 'Estado de integraciones' } : null,
      user?.is_admin ? { key: 'modificadores', label: 'Modificadores' } : null,
    ].filter(Boolean),
    usuarios: [
      { key: 'equipo', label: 'Equipo' },
    ],
    tecnico: [
      { key: 'params-sistema', label: 'Parámetros del sistema' },
    ],
  }

  const defaultSection = topSections[0]?.key || 'config'
  const [activeSection, setActiveSection] = useState(defaultSection)
  const [activeSidebarItem, setActiveSidebarItem] = useState(
    sidebarMap[defaultSection]?.[0]?.key
  )

  function handleSectionChange(sectionKey) {
    setActiveSection(sectionKey)
    setActiveSidebarItem(sidebarMap[sectionKey]?.[0]?.key)
  }

  function handleMobileNavigate(path) {
    setMobileDrawerOpen(false)
    navigate(path)
  }

  function handleMobileLogout() {
    setMobileDrawerOpen(false)
    logout()
    navigate('/login')
  }

  const sidebarItems = sidebarMap[activeSection] || []

  return (
    <div className={`settings-layout${isMobile ? ' settings-layout--mobile' : ''}`}>

      {isMobile && (
        <>
          <button
            type="button"
            className={`home-mobile-drawer-backdrop${mobileDrawerOpen ? ' is-open' : ''}`}
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Cerrar panel lateral"
          />

          <aside className={`home-mobile-drawer${mobileDrawerOpen ? ' is-open' : ''}`} aria-hidden={!mobileDrawerOpen}>
            <div className="home-mobile-drawer__header">
              <div className="home-mobile-drawer__identity">
                <div className="home-mobile-drawer__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                  {initials(user?.username || 'Usuario')}
                </div>
                <div>
                  <strong>{user?.username || 'Usuario'}</strong>
                  <span>{user?.is_admin ? 'Administrador' : 'Workspace operativo'}</span>
                </div>
              </div>
              <button type="button" className="home-mobile-drawer__close" onClick={() => setMobileDrawerOpen(false)}>
                ×
              </button>
            </div>

            <div className="home-mobile-drawer__actions">
              <button type="button" className="settings-sidebar-item settings-sidebar-item--active" onClick={() => handleMobileNavigate('/settings')}>
                Configuración
              </button>
              <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/')}>
                Volver al dashboard
              </button>
              {user?.is_approver && (
                <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/approvals')}>
                  Aprobaciones
                </button>
              )}
              <button type="button" className="settings-sidebar-item" onClick={handleMobileLogout}>
                Cerrar sesión
              </button>
            </div>
          </aside>

          <section className="home-mobile-topband settings-mobile-topband">
            <header className="home-mobile-header">
              <button
                type="button"
                className="home-mobile-user-trigger"
                onClick={() => setMobileDrawerOpen(true)}
                aria-expanded={mobileDrawerOpen}
                aria-label="Abrir panel de usuario"
              >
                <span className="home-mobile-user-trigger__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                  {initials(user?.username || 'Usuario')}
                </span>
                <span className="home-mobile-user-trigger__body">
                  <span className="home-mobile-user-trigger__name">{user?.username || 'Usuario'}</span>
                  <span className="home-mobile-user-trigger__meta">Workspace Reval</span>
                </span>
              </button>
              <div className="home-mobile-header__utilities">
                <button type="button" className="home-mobile-utility-pill" onClick={() => handleMobileNavigate('/')}>
                  Dashboard
                </button>
                <button type="button" className="home-mobile-utility-icon" onClick={() => setMobileDrawerOpen(true)} aria-label="Abrir perfil">
                  ≡
                </button>
              </div>
            </header>

            <section className="home-mobile-overview settings-mobile-overview">
              <span className="home-mobile-overview__eyebrow">Configuración</span>
              <h1>Accesos y parámetros</h1>
              <p>Ordenamos la configuración para celular con accesos claros, secciones compactas y detalle directo donde más importa.</p>
            </section>
          </section>
        </>
      )}

      {/* Top navigation bar */}
      <nav className="settings-topnav">
        <span className="settings-topnav-brand">Configuración</span>
        {topSections.map((s) => (
          <button
            key={s.key}
            className={`settings-topnav-item${activeSection === s.key ? ' settings-topnav-item--active' : ''}`}
            onClick={() => handleSectionChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Body: sidebar + content */}
      <div className="settings-body">
        <aside className="settings-sidebar">
          {sidebarItems.map((item) => (
            <button
              key={item.key}
              className={`settings-sidebar-item${activeSidebarItem === item.key ? ' settings-sidebar-item--active' : ''}`}
              onClick={() => setActiveSidebarItem(item.key)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="settings-main">
          {activeSidebarItem === 'mapa' && <MapPanel />}
          {activeSidebarItem === 'personalizacion' && <ThemePanel />}
          {activeSidebarItem === 'integraciones' && <IntegrationStatusPanel />}
          {activeSidebarItem === 'equipo' && user?.is_admin && (
            <UsersPanel currentUser={user} onCurrentUserUpdated={refreshUser} isMobile={isMobile} />
          )}
          {activeSidebarItem === 'params-sistema' && <SystemParamsPanel />}
          {activeSidebarItem === 'modificadores' && user?.is_admin && <ModifiersPanel />}
        </div>
      </div>
    </div>
  )
}
