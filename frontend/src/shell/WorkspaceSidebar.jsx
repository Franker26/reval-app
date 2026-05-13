import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getSavedAppName, getSavedLogo } from '../theme.js'
import { avatarColor, initials } from '../utils/avatars.js'
import { useModules } from '../framework/useModules.js'

const SidebarIcons = {
  dashboard: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <rect x="2" y="3" width="4" height="14" rx="1.5" />
      <rect x="8" y="3" width="4" height="14" rx="1.5" />
      <rect x="14" y="3" width="4" height="14" rx="1.5" />
    </svg>
  ),
  agenda: (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
      <rect x="3" y="4" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.25 2.75v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.75 2.75v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.75 7.25h12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  revisiones: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  reviews: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  apps: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M3 4.75A1.75 1.75 0 014.75 3h5.5a.75.75 0 010 1.5h-5.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h5.5a.75.75 0 010 1.5h-5.5A1.75 1.75 0 013 15.25V4.75z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M11.47 6.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 11-1.06-1.06l1.97-1.97H8.25a.75.75 0 010-1.5h5.19l-1.97-1.97a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  ),
}

function userRoleLabel(user) {
  if (user?.is_approver) return 'Admin approver'
  if (user?.is_admin) return 'Administrador'
  return 'Workspace operativo'
}

export default function WorkspaceSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const registry = useModules()
  const [logo, setLogo] = useState(() => getSavedLogo())
  const [appName, setAppName] = useState(() => getSavedAppName())
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })

  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'acm_theme_logo') setLogo(e.newValue)
      if (e.key === 'acm_theme_name') setAppName(e.newValue || 'ACM Real Estate')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    function onThemeChange() {
      setLogo(getSavedLogo())
      setAppName(getSavedAppName())
    }
    window.addEventListener('acm_theme_changed', onThemeChange)
    return () => window.removeEventListener('acm_theme_changed', onThemeChange)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('sidebar_collapsed', String(next)) } catch {}
      return next
    })
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const workspaceItems = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      hint: 'Resumen y actividad',
      icon: SidebarIcons.dashboard,
      to: '/',
      active: location.pathname === '/',
      visible: true,
    },
    {
      key: 'pipeline',
      label: 'Pipeline',
      hint: 'Tasaciones en curso',
      icon: SidebarIcons.pipeline,
      to: '/pipeline',
      active: location.pathname === '/pipeline',
      visible: true,
    },
  ].filter((item) => item.visible)

  const appItems = registry.getNavItems(user).map((item) => ({
    key: item.key,
    label: item.label,
    hint: item.hint || item.label,
    icon: SidebarIcons[item.icon] ?? SidebarIcons.apps,
    to: item.to,
    active: location.pathname.startsWith(item.to),
  }))

  const settingsActive = location.pathname.startsWith('/settings')
  const appsActive = location.pathname.startsWith('/apps')

  function NavItem({ item }) {
    return (
      <button
        key={item.key}
        type="button"
        className={`sidebar__nav-item${item.active ? ' is-active' : ''}`}
        onClick={() => navigate(item.to)}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={item.active ? 'page' : undefined}
      >
        <span className="sidebar__nav-icon">{item.icon}</span>
        {!collapsed && (
          <span className="sidebar__nav-copy">
            <strong className="sidebar__nav-label">{item.label}</strong>
            <small className="sidebar__nav-hint">{item.hint}</small>
          </span>
        )}
      </button>
    )
  }

  return (
    <aside className={`workspace-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Navegación del workspace">
      <div className="sidebar__inner">
        <div className="sidebar__top">
          <div className="sidebar__brand">
            <span className="sidebar__brand-mark">
              {logo ? (
                <img src={logo} alt={`${appName} logo`} className="sidebar__brand-logo" />
              ) : (
                <span className="sidebar__brand-glyph">{appName.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            {!collapsed && (
              <div className="sidebar__brand-copy">
                <strong className="sidebar__brand-name">{appName}</strong>
                <span className="sidebar__brand-desc">{user?.is_admin ? 'Coordinación de equipo' : 'Workspace operativo'}</span>
              </div>
            )}
            <button
              type="button"
              className="sidebar__toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
              title={collapsed ? 'Expandir' : 'Colapsar'}
            >
              {collapsed ? SidebarIcons.expand : SidebarIcons.collapse}
            </button>
          </div>

          {!collapsed && (
            <div className="sidebar__context">
              <span className="sidebar__context-eyebrow">Workspace</span>
              <strong className="sidebar__context-title">Navegación central</strong>
              <p className="sidebar__context-copy">Accesos principales, configuración operativa y estado de tu equipo en un solo lugar.</p>
            </div>
          )}
        </div>

        <div className="sidebar__section">
          {!collapsed && <span className="sidebar__section-label">Principal</span>}
          <nav className="sidebar__nav" aria-label="Secciones principales">
            {workspaceItems.map((item) => <NavItem key={item.key} item={item} />)}
          </nav>
        </div>

        {appItems.length > 0 && (
          <div className="sidebar__section">
            {!collapsed && <span className="sidebar__section-label">Aplicaciones</span>}
            <nav className="sidebar__nav" aria-label="Aplicaciones instaladas">
              {appItems.map((item) => <NavItem key={item.key} item={item} />)}
            </nav>
          </div>
        )}

        <div className="sidebar__spacer" />

        <div className="sidebar__section sidebar__section--support">
          {!collapsed && <span className="sidebar__section-label">Sistema</span>}
          <button
            type="button"
            className={`sidebar__nav-item${settingsActive ? ' is-active' : ''}`}
            onClick={() => navigate('/settings')}
            title={collapsed ? 'Configuración' : undefined}
            aria-label="Configuración"
            aria-current={settingsActive ? 'page' : undefined}
          >
            <span className="sidebar__nav-icon">{SidebarIcons.settings}</span>
            {!collapsed && (
              <span className="sidebar__nav-copy">
                <strong className="sidebar__nav-label">Configuración</strong>
                <small className="sidebar__nav-hint">Marca, usuarios e integraciones</small>
              </span>
            )}
          </button>
          {user?.is_admin && (
            <button
              type="button"
              className={`sidebar__nav-item${appsActive ? ' is-active' : ''}`}
              onClick={() => navigate('/apps')}
              title={collapsed ? 'App Store' : undefined}
              aria-label="App Store"
              aria-current={appsActive ? 'page' : undefined}
            >
              <span className="sidebar__nav-icon">{SidebarIcons.apps}</span>
              {!collapsed && (
                <span className="sidebar__nav-copy">
                  <strong className="sidebar__nav-label">App Store</strong>
                  <small className="sidebar__nav-hint">Módulos instalados</small>
                </span>
              )}
            </button>
          )}
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__user" title={collapsed ? user?.username : undefined}>
            <div className="sidebar__user-avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
              {initials(user?.username || 'Usuario')}
            </div>
            {!collapsed && (
              <div className="sidebar__user-info">
                <strong>{user?.username || 'Usuario'}</strong>
                <span>{userRoleLabel(user)}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`sidebar__logout${collapsed ? ' is-icon-only' : ''}`}
            onClick={handleLogout}
            title={collapsed ? 'Salir' : undefined}
            aria-label="Salir"
          >
            <span className="sidebar__nav-icon">{SidebarIcons.logout}</span>
            {!collapsed && <span className="sidebar__logout-label">Salir</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
