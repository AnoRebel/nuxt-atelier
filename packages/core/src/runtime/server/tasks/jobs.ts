// The `atelier:jobs` Nitro task: runs due background jobs. Scheduled with `jobs.schedule` (every minute by
// default). In development, Nitro runs it by hand at /_nitro/tasks/atelier:jobs. A task is a plain object:
// `defineTask` only types it.
import { useAtelierJobs } from '../index'

export default {
  meta: { name: 'atelier:jobs', description: 'Run due Nuxt Atelier background jobs' },
  async run() {
    // under a minute, so scheduled runs rarely overlap (they're safe if they do)
    return { result: await (await useAtelierJobs()).run({ budgetMs: 50_000 }) }
  },
}
