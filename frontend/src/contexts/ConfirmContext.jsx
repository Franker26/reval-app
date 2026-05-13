import React, { createContext, useContext, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const ConfirmContext = createContext(async () => false)

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }) {
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
