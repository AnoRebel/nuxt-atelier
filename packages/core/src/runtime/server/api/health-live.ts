// GET /api/_atelier/health/live: the server is up and answering. Checks nothing else, so an orchestrator
// doesn't restart a healthy process because its database is down (that's what readiness says).
import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler(() => Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } }))
