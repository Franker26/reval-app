import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  applyTheme,
  getSavedColor,
  getSavedLogo,
  getSavedAppName,
  syncBranding,
} from './theme.js'
import NuevaTasacion from './pages/NuevaTasacion.jsx'
import TipoACM from './pages/TipoACM.jsx'
import AgregarComparables from './pages/AgregarComparables.jsx'
import AplicarPonderadores from './pages/AplicarPonderadores.jsx'
import ResultadosDashboard from './pages/ResultadosDashboard.jsx'
import ExportarPDF from './pages/ExportarPDF.jsx'
import Pipeline from './pages/Pipeline.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'
import Approvals from './pages/Approvals.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminCompanyDetail from './pages/admin/AdminCompanyDetail.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'
import ErrorPage from './pages/ErrorPage.jsx'
import FloatingCalculator from './components/FloatingCalculator.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { getBrandingSettings, getCurrentUser, loginUser } from './api.js'

// --- Auth ---

const AuthContext = createContext(null)
const ConfirmContext = createContext(async () => false)

export function useAuth() {
  return useContext(AuthContext)
}

export function useConfirm() {
  return useContext(ConfirmContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('acm_user')) } catch { return null }
  })

  useEffect(() => {
    const token = localStorage.getItem('acm_token')
    if (!token) return
    getCurrentUser()
      .then((nextUser) => {
        localStorage.setItem('acm_user', JSON.stringify(nextUser))
        setUser(nextUser)
      })
      .catch(() => {
        localStorage.removeItem('acm_token')
        localStorage.removeItem('acm_user')
        setUser(null)
      })
  }, [])

  async function login(username, password) {
    const data = await loginUser(username, password)
    localStorage.setItem('acm_token', data.access_token)
    const u = {
      username: data.username,
      is_admin: data.is_admin,
      is_approver: data.is_approver,
      needs_approval: data.needs_approval,
    }
    localStorage.setItem('acm_user', JSON.stringify(u))
    setUser(u)
  }

  async function refreshUser() {
    const nextUser = await getCurrentUser()
    localStorage.setItem('acm_user', JSON.stringify(nextUser))
    setUser(nextUser)
    return nextUser
  }

  function logout() {
    localStorage.removeItem('acm_token')
    localStorage.removeItem('acm_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// --- Wizard ---

const initialState = {
  acmId: null,
  comparables: [],
  resultado: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ACM_ID':
      return { ...state, acmId: action.payload }
    case 'SET_COMPARABLES':
      return { ...state, comparables: action.payload }
    case 'SET_RESULTADO':
      return { ...state, resultado: action.payload }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export const WizardContext = createContext(null)

export function useWizard() {
  return useContext(WizardContext)
}

function initials(name = '') {
  return name.slice(0, 2).toUpperCase() || 'AC'
}

function avatarColor(seed = '') {
  let hash = 0
  for (const char of seed) hash = char.charCodeAt(0) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 46%)`
}

function userRoleLabel(user) {
  if (user?.is_approver) return 'Admin approver'
  if (user?.is_admin) return 'Administrador'
  return 'Workspace operativo'
}

function WizardProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const chartRef = useRef(null)
  return (
    <WizardContext.Provider value={{ state, dispatch, chartRef }}>
      {children}
    </WizardContext.Provider>
  )
}

function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)

  function confirm(options) {
    return new Promise((resolve) => {
      setDialog({ ...options, resolve })
    })
  }

  function handleCancel() {
    if (!dialog) return
    dialog.resolve(false)
    setDialog(null)
  }

  function handleConfirm() {
    if (!dialog) return
    dialog.resolve(true)
    setDialog(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={Boolean(dialog)}
        tone={dialog?.tone}
        eyebrow={dialog?.eyebrow}
        title={dialog?.title}
        description={dialog?.description}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  )
}

const STEPS = [
  { num: 1, label: 'Sujeto', description: 'Ficha base del inmueble' },
  { num: 2, label: 'Comparables', description: 'Base de mercado activa' },
  { num: 3, label: 'Ponderadores', description: 'Ajustes y calibración' },
  { num: 4, label: 'Resultados', description: 'Valor estimado y rango' },
  { num: 5, label: 'Exportar PDF', description: 'Cierre y entrega' },
]

function WizardNavInner({ currentStep }) {
  const { state } = useWizard()
  const { user } = useAuth()
  const navigate = useNavigate()
  const acmId = state.acmId

  function goToStep(num) {
    if (!acmId) return
    if (num === 1) navigate(`/acm/${acmId}/step/1`)
    else navigate(`/acm/${acmId}/step/${num}`)
  }

  return (
    <section className="wizard-shell" aria-label="Pipeline de confección">
      <div className="wizard-shell__header">
        <button type="button" className="wizard-shell__back" onClick={() => navigate('/')}>
          ← Dashboard
        </button>
        {user && (
          <div className="wizard-shell__user">
            <div className="wizard-shell__user-avatar">
              <span
                className="wizard-shell__user-avatar-mark"
                style={{ background: avatarColor(user.username || 'Usuario') }}
              >
                {initials(user.username || 'Usuario')}
              </span>
            </div>
            <div className="wizard-shell__user-copy">
              <strong>{user.username}</strong>
              <span>{user.is_approver ? 'Admin approver' : user.is_admin ? 'Administrador' : 'Workspace operativo'}</span>
            </div>
          </div>
        )}
      </div>

      <nav className="wizard-nav">
        {STEPS.map((s) => {
          const isDone = currentStep > s.num
          const isActive = currentStep === s.num
          const isClickable = acmId && s.num !== currentStep && s.num <= currentStep + 1
          const statusLabel = isDone ? 'Completo' : isActive ? 'Actual' : `Paso ${s.num}`

          return (
            <div
              key={s.num}
              className={`wizard-step${isActive ? ' active' : ''}${isDone ? ' done' : ''}${isClickable ? ' clickable' : ''}`}
              onClick={() => isClickable && goToStep(s.num)}
              title={isClickable ? `Ir al paso ${s.num}` : undefined}
            >
              <span className="step-num">{isDone ? '✓' : s.num}</span>
              <span className="wizard-step__copy">
                <span className="step-label">{s.label}</span>
                <span className="step-meta">{s.description}</span>
              </span>
              <span className="wizard-step__status">{statusLabel}</span>
            </div>
          )
        })}
      </nav>
    </section>
  )
}

export function WizardNav({ currentStep }) {
  return <WizardNavInner currentStep={currentStep} />
}

function AppHeader() {
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

  // Allow Settings to trigger header refresh without cross-tab
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
  const isWorkflowRoute = location.pathname.startsWith('/acm/')

  const navItems = [
    { to: '/', label: 'Tablero', visible: true },
    { to: '/approvals', label: 'Aprobaciones', visible: user?.is_approver },
    { to: '/settings', label: 'Configuración', visible: Boolean(user) },
  ].filter((item) => item.visible)

  return (
    <header className={`app-header${isHomeRoute || isApprovalsRoute || isSettingsRoute || isPipelineRoute || isWorkflowRoute ? ' app-header--workspace-hidden app-header--home-mobile-hidden' : ''}`}>
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

            <button
              onClick={handleLogout}
              className="header-logout"
            >
              Salir
            </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/error/:code" element={<ErrorPage />} />
      <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/acm/tipo" element={<PrivateRoute><TipoACM /></PrivateRoute>} />
      <Route path="/acm/new" element={<PrivateRoute><NuevaTasacion /></PrivateRoute>} />
      <Route path="/acm/:id/step/1" element={<PrivateRoute><NuevaTasacion /></PrivateRoute>} />
      <Route path="/acm/:id/step/2" element={<PrivateRoute><AgregarComparables /></PrivateRoute>} />
      <Route path="/acm/:id/step/3" element={<PrivateRoute><AplicarPonderadores /></PrivateRoute>} />
      <Route path="/acm/:id/step/4" element={<PrivateRoute><ResultadosDashboard /></PrivateRoute>} />
      <Route path="/acm/:id/step/5" element={<PrivateRoute><ExportarPDF /></PrivateRoute>} />
      <Route path="/pipeline" element={<PrivateRoute><Pipeline /></PrivateRoute>} />
      <Route path="/approvals" element={<PrivateRoute><Approvals /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/" element={<AdminLogin />} />
      <Route path="/admin/companies" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/companies/:id" element={<AdminRoute><AdminCompanyDetail /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
      <Route path="/admin/*" element={<AdminLogin />} />
      <Route path="*" element={<Navigate to="/error/404" replace />} />
    </Routes>
  )
}

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
  revisiones: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
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

function WorkspaceSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
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

  const navItems = [
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
    {
      key: 'agenda',
      label: 'Agenda',
      hint: 'Eventos y seguimiento',
      icon: SidebarIcons.agenda,
      to: '/agenda',
      active: location.pathname.startsWith('/agenda'),
      visible: Boolean(user),
    },
    {
      key: 'revisiones',
      label: 'Revisiones',
      hint: 'Cola de aprobaciones',
      icon: SidebarIcons.revisiones,
      to: '/approvals',
      active: location.pathname.startsWith('/approvals'),
      visible: Boolean(user?.is_approver),
    },
  ].filter((item) => item.visible)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const settingsActive = location.pathname.startsWith('/settings')

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
            {navItems.map((item) => (
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
            ))}
          </nav>
        </div>

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

function AppShell() {
  const location = useLocation()
  const isErrorRoute = location.pathname.startsWith('/error') || location.pathname === '/404'
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 820
  })

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 820)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isWorkflowRoute = location.pathname.startsWith('/acm/')
  const isWorkspaceRoute = location.pathname === '/' || location.pathname === '/pipeline' || location.pathname.startsWith('/approvals') || location.pathname.startsWith('/settings')
  const showWorkspaceSidebar = isWorkspaceRoute && !isWorkflowRoute && !isMobile

  return (
    <>
      <AppHeader />
      <main className={`app-main${isErrorRoute ? ' app-main--error' : ''}${showWorkspaceSidebar ? ' app-main--workspace' : ''}`}>
        {showWorkspaceSidebar ? (
          <div className="workspace-layout">
            <WorkspaceSidebar />
            <div className="workspace-layout__content">
              <AppRoutes />
            </div>
          </div>
        ) : (
          <AppRoutes />
        )}
      </main>
      {!isErrorRoute ? <FloatingCalculator /> : null}
    </>
  )
}

function AdminLayout({ children }) {
  const navigate = useNavigate()
  function handleLogout() {
    localStorage.removeItem('acm_admin_token')
    localStorage.removeItem('acm_admin_user')
    navigate('/admin')
  }
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-header__brand">ACM Admin</span>
        <nav style={{ display: 'flex', gap: '1.25rem' }}>
          <Link to="/admin/companies" className="admin-link" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Empresas
          </Link>
          <Link to="/admin/settings" className="admin-link" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Configuración
          </Link>
        </nav>
        <button onClick={handleLogout} className="admin-btn admin-btn--sm" style={{ marginLeft: 'auto' }}>
          Salir
        </button>
      </header>
      <div className="admin-content">{children}</div>
    </div>
  )
}

function AdminRoute({ children }) {
  const token = localStorage.getItem('acm_admin_token')
  return token ? <AdminLayout>{children}</AdminLayout> : <Navigate to="/admin" replace />
}

export default function App() {
  useEffect(() => {
    applyTheme(getSavedColor())
    getBrandingSettings()
      .then((branding) => {
        syncBranding(branding)
        applyTheme(branding.primary_color)
        window.dispatchEvent(new Event('acm_theme_changed'))
      })
      .catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <ConfirmProvider>
            <WizardProvider>
              <AppShell />
            </WizardProvider>
          </ConfirmProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  )
}
