import React, { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { applyTheme, getSavedColor, syncBranding } from './theme.js'
import { getBrandingSettings } from './api.js'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ConfirmProvider, useConfirm } from './contexts/ConfirmContext.jsx'
import { WizardProvider, useWizard, WizardContext } from './modules/acm-core/contexts/WizardContext.jsx'
import WizardNavComponent from './modules/acm-core/components/WizardNav.jsx'
import AppShell from './shell/AppShell.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'

// Re-exports for backwards compatibility — pages still import from App.jsx
export { useAuth, useConfirm, useWizard, WizardContext }
export const WizardNav = WizardNavComponent

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
