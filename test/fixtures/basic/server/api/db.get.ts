import { useAtelierDatabase } from '#atelier/server'
import { defineEventHandler } from 'nuxt/server'

// Test probe: connects with the runtime database URL
export default defineEventHandler(async () => {
  const { dialect, ping } = await useAtelierDatabase()
  await ping()
  return { dialect }
})
