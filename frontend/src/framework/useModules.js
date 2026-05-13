import { useSyncExternalStore } from 'react'
import { registry } from './ModuleRegistry.js'

export function useModules() {
  useSyncExternalStore(
    (fn) => registry.subscribe(fn),
    () => registry.getSnapshot(),
  )
  return registry
}
