import React from 'react'

export function RoleBadges({ user }) {
  return (
    <div className="settings-badges">
      {user.is_admin && <span className="settings-badge settings-badge--admin">Admin</span>}
      {user.is_approver && <span className="settings-badge settings-badge--approver">Approver</span>}
      {!user.is_admin && <span className="settings-badge">Usuario</span>}
      {user.needs_approval && <span className="settings-badge settings-badge--warning">Requiere aprobación</span>}
    </div>
  )
}

export function SectionTitle({ children }) {
  return <h2 className="settings-main-title">{children}</h2>
}

export function primaryRoleLabel(user) {
  if (user.is_approver) return 'Approver'
  if (user.is_admin) return 'Admin'
  return 'Usuario'
}
