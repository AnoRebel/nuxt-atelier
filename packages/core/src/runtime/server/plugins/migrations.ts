// Production startup: log pending migrations, or apply them with `migrations.autoApply`
// (a Nitro plugin is a plain function; `defineNitroPlugin` only types it)
import { useRuntimeConfig } from 'nuxt/server'
import { pendingMigrations } from '../db/state'
import { useAtelierDatabase } from '../index'
import { logger } from '../logger'

export default () => {
  // D1 bindings only exist inside a request: there, the first CMS write checks (assertMigrated)
  if (import.meta.dev || useRuntimeConfig().atelier.databaseUrl.startsWith('d1:'))
    return
  pendingMigrations(useAtelierDatabase).catch((error: Error) => {
    logger.error('Couldn\'t check migrations', { error })
  })
}
