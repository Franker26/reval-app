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

function WorkspaceSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [logo, setLogo] = useState(() => getSavedLogo())
  const [appName, setAppName] = useState(() => getSavedAppName())
  const [menuOpen, setMenuOpen] = useState(false)

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
    setMenuOpen(false)
  }, [location.pathname])

  const navItems = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      description: 'Tablero operativo de tasaciones',
      note: 'Vista general',
      to: '/',
      visible: true,
      active: location.pathname === '/',
    },
    {
      key: 'approvals',
      label: 'Aprobaciones',
      description: 'Cola de revisión del equipo',
      note: 'Pendientes y feedback',
      to: '/approvals',
      visible: user?.is_approver,
      active: location.pathname.startsWith('/approvals'),
    },
    {
      key: 'settings',
      label: 'Configuración',
      description: 'Marca, usuarios y preferencias',
      note: 'Workspace',
      to: '/settings',
      visible: Boolean(user),
      active: location.pathname.startsWith('/settings'),
    },
  ].filter((item) => item.visible)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="workspace-sidebar" aria-label="Navegación del workspace">
      <section className="home-panel home-panel--brand">
        <div className="home-workspace-card">
          <span className="home-workspace-card__mark">
            {logo ? (
              <img src={logo} alt={`${appName} logo`} className="home-workspace-card__logo" />
            ) : (
              <span>{appName.slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <div>
            <span className="home-panel__eyebrow">Workspace</span>
            <strong>{appName}</strong>
            <p>{user?.is_admin ? 'Vista de coordinación del equipo.' : 'Centro operativo personal.'}</p>
          </div>
        </div>

        <button
          type="button"
          className={`home-workspace-menu-toggle${menuOpen ? ' is-open' : ''}`}
          aria-expanded={menuOpen}
          aria-controls="workspace-nav-menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span className="home-workspace-menu-toggle__copy">
            <strong>Accesos</strong>
            <small>Explorar workspace</small>
          </span>
          <span className="home-workspace-menu-toggle__chevron" aria-hidden="true">⌄</span>
        </button>

        <div
          id="workspace-nav-menu"
          className={`home-workspace-menu${menuOpen ? ' is-open' : ''}`}
          aria-hidden={!menuOpen}
        >
          <div className="home-panel__header home-panel__header--menu">
            <div>
              <span className="home-panel__eyebrow">Navegación</span>
              <strong>Accesos principales</strong>
            </div>
          </div>

          <div className="home-rail-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`home-rail-nav__item${item.active ? ' is-active' : ''}`}
                onClick={() => navigate(item.to)}
              >
                <span>{item.label}</span>
                <strong>{item.description}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>

          <div className="home-workspace-menu__footer">
            <div className="home-user-card">
              <div className="home-user-card__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                {initials(user?.username || 'Usuario')}
              </div>
              <div>
                <strong>{user?.username || 'Usuario'}</strong>
                <p>{userRoleLabel(user)}</p>
              </div>
            </div>
            <button type="button" className="home-user-card__logout" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </section>
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
