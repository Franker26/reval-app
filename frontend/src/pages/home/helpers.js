export function statusLabel(acm) {
  if (!acm.requires_approval) return 'Sin aprobación'
  return acm.approval_status || 'Pendiente'
}

export function statusMeta(acm) {
  const label = statusLabel(acm)
  const normalized = String(label).toLowerCase()
  if (normalized.includes('cambio')) {
    return { label, tone: 'danger', hint: 'Requiere cambios antes de poder aprobarse.', dotLabel: 'Cambios solicitados' }
  }
  if (normalized.includes('aprob')) {
    return { label, tone: 'success', hint: 'Tasacion aprobada y lista para continuar o exportar.', dotLabel: 'Aprobada' }
  }
  if (normalized.includes('pendiente')) {
    return { label, tone: 'warning', hint: 'Pendiente de revision y aprobacion.', dotLabel: 'Pendiente' }
  }
  return { label, tone: 'neutral', hint: 'Esta tasacion no requiere aprobacion.', dotLabel: 'Sin aprobacion' }
}

export function stageProgress(acm) {
  const order = ['nuevo', 'en_progreso', 'finalizado', 'cancelado']
  const index = order.indexOf(acm.stage || 'nuevo')
  if (index <= 0) return 'Paso inicial'
  if (index === 1) return 'Carga y ajuste en curso'
  if (index === 2) return 'Lista para exportar'
  return 'Flujo detenido'
}

export function comparablesLabel(acm) {
  const count = acm.cantidad_comparables || 0
  return `${count} comparable${count === 1 ? '' : 's'}`
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString('es-AR')
}

export function formatEventDate(value) {
  return new Date(value).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatEventTime(value, allDay) {
  if (allDay) return 'Todo el día'
  return new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function startOfHour(date) {
  const next = new Date(date)
  next.setMinutes(0, 0, 0)
  return next
}

export function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}
