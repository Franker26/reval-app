import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getSavedAppName, getSavedLogo } from '../theme.js'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [logo, setLogo] = useState(() => getSavedLogo())
  const [appName, setAppName] = useState(() => getSavedAppName())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (location.pathname === '/login' || location.pathname.startsWith('/admin') || location.pathname.startsWith('/error')) return null

  const isHomeRoute = location.pathname === '/'
  const isApprovalsRoute = location.pathname === '/approvals'
  const isSettingsRoute = location.pathname === '/settings'
  const isPipelineRoute = location.pathname === '/pipeline'
  const isAgendaRoute = location.pathname.startsWith('/agenda')
  const isWorkflowRoute = location.pathname.startsWith('/acm/')

  const navItems = [
    { to: '/', label: 'Tablero', visible: true },
    { to: '/approvals', label: 'Aprobaciones', visible: user?.is_approver },
    { to: '/settings', label: 'Configuración', visible: Boolean(user) },
  ].filter((item) => item.visible)

  return (
    <header className={`app-header${isHomeRoute || isApprovalsRoute || isSettingsRoute || isPipelineRoute || isAgendaRoute || isWorkflowRoute ? ' app-header--workspace-hidden app-header--home-mobile-hidden' : ''}`}>
      <div className="app-header__shell">
        <div className="app-header__left">
          <Link to="/" className="app-title">
            <span className="app-title__mark">
              {logo ? (
                <img src={logo} alt="logo" className="app-title__logo" />
              ) : (
                <span className="app-title__glyph">R</span>
              )}
            </span>
            <span>
              <span className="app-title__name">{appName}</span>
              <span className="app-title__meta">Workspace de tasaciones</span>
            </span>
          </Link>
        </div>

        {user && (
          <>
            <button
              type="button"
              className={`header-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
              aria-label="Abrir navegación"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <span />
              <span />
              <span />
            </button>

            <div className={`app-header__right${mobileMenuOpen ? ' is-open' : ''}`}>
              <nav className="header-nav" aria-label="Principal">
                {navItems.map((item) => {
                  const isActive = item.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.to)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`header-link${isActive ? ' header-link--active' : ''}`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </nav>

              <div className="header-user">
                <div className="header-user__avatar">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="header-user__name">{user.username}</div>
                  <div className="header-user__role">
                    {user.is_approver ? 'Admin approver' : user.is_admin ? 'Admin' : 'Usuario'}
                  </div>
                </div>
              </div>

              <button onClick={handleLogout} className="header-logout">
                Salir
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
