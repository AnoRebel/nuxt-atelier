import { defineEventHandler } from 'nuxt/server'

// Test probe: the atelier:content:changed calls so far
export default defineEventHandler(() => (globalThis as { __atelierChanges?: unknown[] }).__atelierChanges ?? [])
