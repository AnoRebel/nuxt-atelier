// GET /api/_atelier/health/ready: whether the server can do its work: 200, or 503 when the database is
// unreachable, has pending migrations, or lacks Nuxt Atelier's tables (the job queue can't be read: say, an
// app that never generated its migrations). Reports each check, never connection strings or errors' details
// (they can hold credentials): those go to the server log.
import { defineEventHandler } from 'nuxt/server'
import { pendingMigrations } from '../db/state'
import { useAtelierDatabase, useAtelierJobs, useAtelierStorage } from '../index'
import { logger } from '../logger'

type Check = 'ok' | 'error'
const TIMEOUT = 3000

/** `check` settled within the timeout: its value, or 'error' (logged). */
async function within<T>(name: string, check: () => Promise<T>): Promise<T | 'error'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([check(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT} ms`)), TIMEOUT)
    })])
  }
  catch (error) {
    logger.error(`Readiness: the ${name} check failed`, { error })
    return 'error'
  }
  finally {
    clearTimeout(timer)
  }
}

export default defineEventHandler(async () => {
  const database: Check = await within('database', async () => {
    await (await useAtelierDatabase()).ping()
    return 'ok' as const
  })
  const migrations = database === 'ok' && !import.meta.dev
    ? await within('migrations', async () => ({ pending: (await pendingMigrations(useAtelierDatabase)).length }))
    : database === 'ok' ? { pending: 0 } : 'error'
  // the storage answers: a lookup of a file that isn't there
  const storage: Check = await within('storage', async () => {
    await (await useAtelierStorage()).head('atelier-health-check')
    return 'ok' as const
  })
  const jobs = database === 'ok'
    ? await within('jobs', async () => {
        const queue = await useAtelierJobs()
        return { failed: (await queue.list({ status: 'failed', limit: 1000 })).length }
      })
    : 'error'
  const ready = database === 'ok' && migrations !== 'error' && migrations.pending === 0 && jobs !== 'error'
  return Response.json({ status: ready ? 'ready' : 'unavailable', checks: { database, migrations, storage, jobs } }, { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } })
})
