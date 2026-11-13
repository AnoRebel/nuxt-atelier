// Nuxt Atelier's own background jobs.
import type { Scheduled } from '../schedule'
import type { Message } from '../webhooks'
import { singleSite, useAtelierAudit, useAtelierEntries, useAtelierJobs, useAtelierMedia, useAtelierServerConfig, useAtelierWebhooks } from '../index'
import { defineJob } from '../jobs'
import { defineMailJob } from '../mail'
import { runScheduled, SCHEDULE_JOB } from '../schedule'
import { runDelivery, WEBHOOK_JOB } from '../webhook-jobs'

const DAY = 24 * 3600_000

export default () => {
  // revision retention: see `revisions.keep` and `revisions.days`
  defineJob('atelier:revisions:prune', async () => {
    const { keep, days } = (useAtelierServerConfig() as unknown as { revisions: { keep: number, days: number } }).revisions
    // versions scheduled to be published stay, however old
    const scheduled = await (await useAtelierJobs()).list({ name: SCHEDULE_JOB, limit: 100_000 })
    // (a site's own singleton keeps its revisions under `name@site`)
    const pinned = scheduled.map(j => j.payload as unknown as Scheduled).filter(s => s.version !== undefined).map(s => ({ source: s.type, sourceId: s.singleton && s.site ? `${s.id}@${s.site}` : s.id, version: s.version! }))
    // revisions aren't per site: any site's store prunes them all
    await (await useAtelierEntries(singleSite)).pruneRevisions({ keep, olderThan: new Date(Date.now() - days * DAY), pinned })
    await (await useAtelierWebhooks()).pruneDeliveries(new Date(Date.now() - 30 * DAY)) // the webhook delivery log keeps 30 days
    await (await useAtelierMedia(singleSite)).discardUploadsBefore( // uploads in progress aren't per site
      new Date(Date.now() - DAY)) // resumable uploads left for a day
  }, { every: DAY })

  // webhook deliveries, retried with the queue's backoff
  defineJob<{ webhookId: string, message: Message }>(WEBHOOK_JOB, (payload, job) => runDelivery(payload, job.attempts))

  // email (notifications), retried with the queue's backoff
  defineMailJob()

  // scheduled publishing and unpublishing
  defineJob<Scheduled>(SCHEDULE_JOB, async job => runScheduled(await useAtelierEntries(job.site ? { name: job.site, scoped: true } : singleSite), await useAtelierAudit(), job))
}
