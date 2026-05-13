import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext.jsx'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { avatarColor, initials } from '../../../utils/avatars.js'

const STEPS = [
  { num: 1, label: 'Sujeto', description: 'Ficha base del inmueble' },
  { num: 2, label: 'Comparables', description: 'Base de mercado activa' },
  { num: 3, label: 'Ponderadores', description: 'Ajustes y calibración' },
  { num: 4, label: 'Resultados', description: 'Valor estimado y rango' },
  { num: 5, label: 'Exportar PDF', description: 'Cierre y entrega' },
]

export default function WizardNav({ currentStep }) {
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
