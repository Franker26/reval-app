export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export const EVENT_COLORS = [
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Naranja' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#64748b', label: 'Gris' },
]

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sin repetición' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Todas las semanas' },
  { value: 'monthly', label: 'Todos los meses' },
]

export function defaultColor() {
  return EVENT_COLORS[0].value
}

export function startOfMonth(year, month) {
  return new Date(year, month, 1)
}

export function endOfMonth(year, month) {
  return new Date(year, month + 1, 0, 23, 59, 59, 999)
}

export function addMonths(date, n) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + n)
  return next
}

export function addDays(date, n) {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

export function startOfWeek(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() - next.getDay())
  return next
}

export function eachDayOfInterval(start, end) {
  const days = []
  const current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export function getWeekRange(date) {
  const from = startOfWeek(date)
  const to = new Date(from)
  to.setDate(to.getDate() + 6)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

export function monthEventRowStyle(color) {
  const resolved = color || defaultColor()
  const tint = /^#([0-9a-f]{6})$/i.test(resolved) ? `${resolved}18` : 'rgba(var(--primary-rgb), 0.1)'
  return {
    borderLeftColor: resolved,
    background: tint,
    color: '#18324f',
  }
}

export function recurrencePresetFromRule(rule = '') {
  if (!rule) return 'none'
  if (rule.includes('FREQ=DAILY')) return 'daily'
  if (rule.includes('FREQ=WEEKLY')) return 'weekly'
  if (rule.includes('FREQ=MONTHLY')) return 'monthly'
  return 'none'
}

export function roundToNextHour(date) {
  const next = new Date(date)
  next.setMinutes(0, 0, 0)
  next.setHours(next.getHours() + 1)
  return next
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmtDateInput(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildDefaultWindow(seedDate) {
  const now = new Date()

  if (!seedDate) {
    const start = roundToNextHour(now)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    return { start, end }
  }

  const day = new Date(seedDate)
  day.setSeconds(0, 0)
  const hasTime = day.getHours() !== 0 || day.getMinutes() !== 0

  if (hasTime) {
    return {
      start: day,
      end: new Date(day.getTime() + 60 * 60 * 1000),
    }
  }

  const start = new Date(day)
  start.setHours(isSameDay(day, now) ? Math.max(9, roundToNextHour(now).getHours()) : 9, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

export function parseInputAsDate(value, allDay, isEnd = false) {
  if (!value) return null

  if (allDay) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0)
  }

  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

export function emptyForm(defaults = {}) {
  const { start, end } = buildDefaultWindow(defaults.start || defaults.start_datetime)
  const fallbackEnd = defaults.end || defaults.end_datetime || end

  return {
    title: '',
    description: '',
    location: '',
    start_datetime: fmtDateInput(start),
    end_datetime: fmtDateInput(fallbackEnd),
    all_day: false,
    color: defaultColor(),
    recurrence: 'none',
    ...defaults,
  }
}

function fmtTimeDisplay(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function eventTimeLabel(event) {
  if (event.all_day) return 'Todo el día'
  return `${fmtTimeDisplay(event.start_datetime)} – ${fmtTimeDisplay(event.end_datetime)}`
}

export function upcomingEvent(events) {
  const now = new Date()
  return [...events]
    .filter((event) => new Date(event.end_datetime || event.start_datetime) >= now)
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))[0] || null
}
