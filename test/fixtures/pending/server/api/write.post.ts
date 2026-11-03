import { assertMigrated } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: stands in for a CMS write endpoint
export default defineEventHandler(async () => {
  await assertMigrated()
  return { ok: true }
})
