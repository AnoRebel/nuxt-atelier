// Graceful shutdown: when the server closes (SIGTERM, SIGINT on the Node, Bun and Deno presets), running
// jobs get 10 s to finish; the rest go back in the queue, and the database connection is closed.
import { useServerHooks } from 'nuxt/server'
import { shutdownAtelier } from '../index'

export default () => {
  (useServerHooks().hook as (name: 'close', fn: () => Promise<void>) => void)('close', () => shutdownAtelier())
}
