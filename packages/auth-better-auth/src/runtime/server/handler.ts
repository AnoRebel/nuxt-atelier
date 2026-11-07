// Better Auth's own routes under /api/auth: OAuth callbacks, two-factor, passkeys, its client API
import config from '#atelier-better-auth'
import { defineEventHandler } from 'nuxt/server'
import { useBetterAuth } from './adapter'

export default defineEventHandler(async event => (await useBetterAuth(config)).handler(event.req))
