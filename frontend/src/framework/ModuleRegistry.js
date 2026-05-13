import { lazy } from 'react'
import ALL_MODULES from './allModules.js'

class ModuleRegistry {
  #catalog = ALL_MODULES
  #installed = new Set()
  #slots = new Map()
  #listeners = new Set()

  #notify() {
    for (const fn of this.#listeners) fn()
  }

  // Called after login with the list of installed module IDs for the company.
  hydrate(installedIds = []) {
    this.#installed = new Set(installedIds)
    this.#notify()
  }

  isInstalled(id) {
    return this.#installed.has(id)
  }

  getCatalog() {
    return this.#catalog
  }

  getInstalled() {
    return this.#catalog.filter((m) => this.#installed.has(m.id))
  }

  // Returns React Router <Route> props for all installed modules.
  getRoutes() {
    return this.getInstalled().flatMap((m) =>
      m.routes.map((r) => ({
        path: r.path,
        Component: lazy(r.element),
      }))
    )
  }

  // Returns nav items for installed modules, filtered by user role.
  getNavItems(user) {
    return this.getInstalled().flatMap((m) =>
      m.navItems.filter((item) => {
        if (!item.requireRole) return true
        if (item.requireRole === 'admin') return user?.is_admin
        if (item.requireRole === 'approver') return user?.is_approver
        return false
      })
    )
  }

  registerSlot(key, Component) {
    this.#slots.set(key, Component)
    this.#notify()
  }

  getSlot(key) {
    return this.#slots.get(key) ?? null
  }

  // useSyncExternalStore API
  subscribe(fn) {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  getSnapshot() {
    return this.#installed
  }
}

export const registry = new ModuleRegistry()
