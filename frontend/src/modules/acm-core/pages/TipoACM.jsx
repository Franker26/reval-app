import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext.jsx'
import WizardNav from '../components/WizardNav.jsx'

const TIPOS = [
  {
    key: 'depto-ph',
    label: 'Departamento / PH',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width={48} height={48}>
        <rect x="6" y="14" width="36" height="28" rx="2" fill="#eef4fb" stroke="#1a3a5c" strokeWidth="2.5"/>
        <rect x="14" y="22" width="7" height="8" rx="1" fill="#1a3a5c" opacity=".25"/>
        <rect x="27" y="22" width="7" height="8" rx="1" fill="#1a3a5c" opacity=".25"/>
        <rect x="19" y="32" width="10" height="10" rx="1" fill="#1a3a5c" opacity=".4"/>
        <path d="M4 14L24 4L44 14" stroke="#1a3a5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    desc: 'Departamentos y PHs en edificios. Modelo con factores de piso, orientación, antigüedad y amenities.',
    available: true,
  },
  {
    key: 'casa',
    label: 'Casa / Chalet',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width={48} height={48}>
        <rect x="8" y="22" width="32" height="20" rx="2" fill="#f0f0f0" stroke="#bbb" strokeWidth="2"/>
        <path d="M4 22L24 6L44 22" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="18" y="30" width="12" height="12" rx="1" fill="#bbb" opacity=".4"/>
      </svg>
    ),
    desc: 'Casas independientes, chalets, residencias con terreno.',
    available: false,
  },
  {
    key: 'local',
    label: 'Local / Oficina',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width={48} height={48}>
        <rect x="6" y="10" width="36" height="32" rx="2" fill="#f0f0f0" stroke="#bbb" strokeWidth="2"/>
        <rect x="14" y="10" width="20" height="10" rx="1" fill="#bbb" opacity=".3"/>
        <rect x="10" y="26" width="10" height="10" rx="1" fill="#bbb" opacity=".25"/>
        <rect x="28" y="26" width="10" height="10" rx="1" fill="#bbb" opacity=".25"/>
        <rect x="18" y="32" width="12" height="10" rx="1" fill="#bbb" opacity=".35"/>
      </svg>
    ),
    desc: 'Locales comerciales, showrooms, oficinas y espacios de coworking.',
    available: false,
  },
]

export default function TipoACM() {
  const navigate = useNavigate()
  const { dispatch } = useWizard()

  function handleSelect(tipo) {
    dispatch({ type: 'RESET' })
    navigate('/acm/new', { state: { tipo } })
  }

  return (
    <div>
      <WizardNav currentStep={1} />
      <div className="step-header">
        <h1>Nueva tasación</h1>
        <p>Seleccioná el tipo de propiedad para comenzar el análisis.</p>
      </div>

      <div className="tipo-grid">
        {TIPOS.map((t) => (
          <div
            key={t.key}
            className={`tipo-card${t.available ? '' : ' tipo-card--disabled'}`}
            onClick={() => t.available && handleSelect(t.key === 'depto-ph' ? 'Departamento' : t.key)}
          >
            <div className="tipo-card__icon">{t.icon}</div>
            <div className="tipo-card__label">{t.label}</div>
            <div className="tipo-card__desc">{t.desc}</div>
            {!t.available && <span className="tipo-card__badge">Próximamente</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
