import { getFriendlyErrorMessage } from './utils/feedback.js'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function getAdminToken() {
  return localStorage.getItem('acm_admin_token')
}

async function adminRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getAdminToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const opts = { method, headers }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('acm_admin_token')
    if (window.location.pathname !== '/admin') window.location.assign('/admin')
    throw new Error(getFriendlyErrorMessage('Sesión expirada'))
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { const err = await res.json(); detail = err.detail || detail } catch {}
    throw new Error(getFriendlyErrorMessage(detail))
  }
  if (res.status === 204) return null
  return res.json()
}

export async function adminLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    let detail = 'Error de autenticación'
    try { detail = (await res.json()).detail || detail } catch {}
    throw new Error(getFriendlyErrorMessage(detail, 'No pudimos validar tus datos. Revisá usuario y contraseña e intentá nuevamente.'))
  }
  return res.json()
}

export const adminListCompanies = () => adminRequest('GET', '/api/admin/companies')
export const adminCreateCompany = (data) => adminRequest('POST', '/api/admin/companies', data)
export const adminGetCompany = (id) => adminRequest('GET', `/api/admin/companies/${id}`)
export const adminUpdateCompany = (id, data) => adminRequest('PATCH', `/api/admin/companies/${id}`, data)
export const adminDeleteCompany = (id) => adminRequest('DELETE', `/api/admin/companies/${id}`)

export const adminListUsers = (companyId) => adminRequest('GET', `/api/admin/companies/${companyId}/users`)
export const adminCreateUser = (companyId, data) => adminRequest('POST', `/api/admin/companies/${companyId}/users`, data)
export const adminUpdateUser = (companyId, userId, data) => adminRequest('PATCH', `/api/admin/companies/${companyId}/users/${userId}`, data)
export const adminDeleteUser = (companyId, userId) => adminRequest('DELETE', `/api/admin/companies/${companyId}/users/${userId}`)
export const adminChangeUserPassword = (companyId, userId, newPassword) =>
  adminRequest('PUT', `/api/admin/companies/${companyId}/users/${userId}/password`, { new_password: newPassword })

export const adminListAcms = (companyId) => adminRequest('GET', `/api/admin/companies/${companyId}/acms`)

export const adminGetIntegrationSettings = () => adminRequest('GET', '/api/admin/settings/integrations')
export const adminUpdateIntegrationSettings = (data) => adminRequest('PUT', '/api/admin/settings/integrations', data)
export const adminCheckIntegrationStatus = () => adminRequest('GET', '/api/admin/settings/integrations/status')
