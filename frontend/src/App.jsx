import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { applyTheme, getSavedColor, syncBranding } from './theme.js'
import { getBrandingSettings } from './api.js'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ConfirmProvider, useConfirm } from './contexts/ConfirmContext.jsx'
import AppShell from './shell/AppShell.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import { avatarColor, initials } from './utils/avatars.js'

// Re-exports for backwards compatibility — pages still import from App.jsx
export { useAuth, useConfirm }

// --- Wizard context (moves to modules/acm-core in Phase 7) ---

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

function WizardProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const chartRef = useRef(null)
  return (
    <WizardContext.Provider value={{ state, dispatch, chartRef }}>
      {children}
    </WizardContext.Provider>
  )
}

// --- Wizard nav (moves to modules/acm-core in Phase 7) ---

const STEPS = [
  { num: 1, label: 'Sujeto', description: 'Ficha base del inmueble' },
  { num: 2, label: 'Comparables', description: 'Base de mercado activa' },
  { num: 3, label: 'Ponderadores', description: 'Ajustes y calibración' },
  { num: 4, label: 'Resultados', description: 'Valor estimado y rango' },
  { num: 5, label: 'Exportar PDF', description: 'Cierre y entrega' },
]

function WizardNavContent({ currentStep }) {
  const { state } = useWizard()
  const { user } = useAuth()
  const navigate = useNavigate()
  const acmId = state.acmId

  function goToStep(num) {
    if (!acmId) return
    navigate(`/acm/${acmId}/step/${num}`)
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

export { WizardNavContent as WizardNav }

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
