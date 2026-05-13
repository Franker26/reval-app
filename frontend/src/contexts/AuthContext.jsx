import React, { createContext, useContext, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getCurrentUser, loginUser } from '../api.js'
import { registry } from '../framework/ModuleRegistry.js'

const _API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function _hydrateModules() {
  try {
    const res = await fetch(`${_API_BASE}/api/modules`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('acm_token')}` },
    })
    if (res.ok) {
      const { installed } = await res.json()
      registry.hydrate(installed)
    }
  } catch {
    // silently ignore — app still works without module registry
  }
}

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('acm_user')) } catch { return null }
  })

  useEffect(() => {
    const token = localStorage.getItem('acm_token')
    if (!token) return
    getCurrentUser()
      .then((nextUser) => {
        localStorage.setItem('acm_user', JSON.stringify(nextUser))
        setUser(nextUser)
        _hydrateModules()
      })
      .catch(() => {
        localStorage.removeItem('acm_token')
        localStorage.removeItem('acm_user')
        setUser(null)
      })
  }, [])

  async function login(username, password) {
    const data = await loginUser(username, password)
    localStorage.setItem('acm_token', data.access_token)
    const u = {
      username: data.username,
      is_admin: data.is_admin,
      is_approver: data.is_approver,
      needs_approval: data.needs_approval,
    }
    localStorage.setItem('acm_user', JSON.stringify(u))
    setUser(u)
    await _hydrateModules()
  }

  async function refreshUser() {
    const nextUser = await getCurrentUser()
    localStorage.setItem('acm_user', JSON.stringify(nextUser))
    setUser(nextUser)
    return nextUser
  }

  function logout() {
    localStorage.removeItem('acm_token')
    localStorage.removeItem('acm_user')
    registry.hydrate([])
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}
