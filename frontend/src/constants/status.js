export const ACM_STAGES = [
  { key: 'nuevo',      title: 'Nuevo',       description: 'Tasaciones recién creadas o pendientes de completar.',  tone: 'blue' },
  { key: 'en_progreso', title: 'En progreso', description: 'Trabajos con comparables o ajustes en análisis.',       tone: 'violet' },
  { key: 'finalizado', title: 'Finalizado',   description: 'Tasaciones listas para exportar o compartir.',          tone: 'green' },
  { key: 'cancelado',  title: 'Cancelado',    description: 'Análisis descartados o pausados.',                      tone: 'slate' },
]

export const STAGE_ORDER = ACM_STAGES.map((s) => s.key)

export const APPROVAL_STATUSES = {
  NO_REQUERIDA: 'No requerida',
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  CAMBIOS_SOLICITADOS: 'Cambios solicitados',
}
