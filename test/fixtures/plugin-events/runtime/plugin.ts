import { defineJob, useAtelierJobs } from '#atelier/server'
import { useServerHooks } from 'nuxt/server'

// The plugin's hook and job: a reminder queued for every new event, the day before it starts
export default () => {
  defineJob<{ id: string }>('events:remind', () => {})
  useServerHooks().hook('atelier:afterCreate', async ({ type, id, entry }) => {
    if (type !== 'events')
      return
    const day = Date.parse(String(entry.data.startsOn)) - 24 * 3600_000
    await (await useAtelierJobs()).enqueue('events:remind', { id }, { key: `events:remind:${id}`, runAt: new Date(Math.max(day, Date.now())) })
  })
}
