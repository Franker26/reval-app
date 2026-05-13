import React, { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { PrivateRoute } from '../contexts/AuthContext.jsx'
import AppHeader from './AppHeader.jsx'
import WorkspaceSidebar from './WorkspaceSidebar.jsx'
import FloatingCalculator from '../components/FloatingCalculator.jsx'
import NuevaTasacion from '../pages/NuevaTasacion.jsx'
import TipoACM from '../pages/TipoACM.jsx'
import AgregarComparables from '../pages/AgregarComparables.jsx'
import AplicarPonderadores from '../pages/AplicarPonderadores.jsx'
import ResultadosDashboard from '../pages/ResultadosDashboard.jsx'
import ExportarPDF from '../pages/ExportarPDF.jsx'
import Pipeline from '../pages/Pipeline.jsx'
import Agenda from '../pages/Agenda.jsx'
import Home from '../pages/Home.jsx'
import Login from '../pages/Login.jsx'
import Settings from '../pages/Settings.jsx'
import Approvals from '../pages/Approvals.jsx'
import AdminLogin from '../pages/admin/AdminLogin.jsx'
import AdminDashboard from '../pages/admin/AdminDashboard.jsx'
import AdminCompanyDetail from '../pages/admin/AdminCompanyDetail.jsx'
import AdminSettings from '../pages/admin/AdminSettings.jsx'
import ErrorPage from '../pages/ErrorPage.jsx'
import AppStore from '../framework/AppStore.jsx'

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
      <Route path="/agenda" element={<PrivateRoute><Agenda /></PrivateRoute>} />
      <Route path="/approvals" element={<PrivateRoute><Approvals /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/apps" element={<PrivateRoute><AppStore /></PrivateRoute>} />
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

const WORKSPACE_ROUTES = ['/', '/pipeline', '/agenda', '/approvals', '/settings', '/apps']

export default function AppShell() {
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
  const isWorkspaceRoute = WORKSPACE_ROUTES.some((r) =>
    r === '/' ? location.pathname === '/' : location.pathname.startsWith(r)
  )
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
