// Nuxt Atelier's own background jobs.
import type { Scheduled } from '../schedule'
import { useAtelierAudit, useAtelierEntries, useAtelierJobs, useAtelierServerConfig } from '../index'
import { defineJob } from '../jobs'
import { runScheduled, SCHEDULE_JOB } from '../schedule'

const DAY = 24 * 3600_000

export default () => {
  // revision retention: see `revisions.keep` and `revisions.days`
  defineJob('atelier:revisions:prune', async () => {
    const { keep, days } = (useAtelierServerConfig() as unknown as { revisions: { keep: number, days: number } }).revisions
    // versions scheduled to be published stay, however old
    const scheduled = await (await useAtelierJobs()).list({ name: SCHEDULE_JOB, limit: 100_000 })
    const pinned = scheduled.map(j => j.payload as unknown as Scheduled).filter(s => s.version !== undefined).map(s => ({ source: s.type, sourceId: s.id, version: s.version! }))
    await (await useAtelierEntries()).pruneRevisions({ keep, olderThan: new Date(Date.now() - days * DAY), pinned })
  }, { every: DAY })

  // scheduled publishing and unpublishing
  defineJob<Scheduled>(SCHEDULE_JOB, async job => runScheduled(await useAtelierEntries(), await useAtelierAudit(), job))
}
