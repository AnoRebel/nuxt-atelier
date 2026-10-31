import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'

// Shows which database the playground is configured for, without leaking the URL
export default defineEventHandler(() => new URL(useRuntimeConfig().atelier.databaseUrl).protocol.slice(0, -1))
