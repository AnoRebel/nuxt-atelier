import { useServerHooks } from 'nuxt/server'

// Test probe: records every atelier:content:changed (read at /api/test/changes)
const changes: unknown[] = ((globalThis as { __atelierChanges?: unknown[] }).__atelierChanges ??= [])

export default () => {
  useServerHooks().hook('atelier:content:changed', (change) => {
    changes.push(change)
  })
}
