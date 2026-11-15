// Demo mode's server plugin, added only with `demo.enabled`: database calls find their request through
// Nitro's async context (which the module turns on), and idle sessions are swept. Imports Nitro's runtime
// directly, so apps without demo mode don't depend on it.
import { useEvent } from 'nitropack/runtime'
import type { RequestEvent } from 'nuxt/server'
import { useServerHooks } from 'nuxt/server'
import { useAtelierServerConfig } from '../index'
import { logger } from '../logger'
import { endAll, setEventResolver, sweep } from './sessions'

export default () => {
  const config = useAtelierServerConfig() as unknown as { demo: { idleTimeout: number }, databaseUrl: string }
  if (!config.databaseUrl.startsWith('file:'))
    throw new Error('[nuxt-atelier] demo.enabled needs an SQLite database (a file: URL): each demo session gets a copy of it')
  setEventResolver(() => {
    try {
      return useEvent() as unknown as RequestEvent
    }
    catch {
      return undefined // outside a request: startup, jobs
    }
  })
  const timer = setInterval(() => void sweep(config.demo.idleTimeout).catch(error => logger.error('Sweeping demo sessions failed', { error })), Math.min(60, config.demo.idleTimeout / 2) * 1000)
  timer.unref?.()
  ;(useServerHooks().hook as (name: 'close', fn: () => Promise<void>) => void)('close', async () => {
    clearInterval(timer)
    await endAll()
  })
  logger.info(`Demo mode: each visitor edits a copy of the site, deleted after ${config.demo.idleTimeout} s idle`)
}
