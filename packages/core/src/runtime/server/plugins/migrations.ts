// Production startup: log pending migrations, or apply them with `migrations.autoApply`
// (a Nitro plugin is a plain function; `defineNitroPlugin` only types it)
import { useAtelierDatabase } from '../index'
import { pendingMigrations } from '../db/state'

export default () => {
  if (import.meta.dev)
    return
  pendingMigrations(useAtelierDatabase).catch((error: Error) => {
    console.error(`[nuxt-atelier] Couldn't check migrations: ${error.message}`)
  })
}
