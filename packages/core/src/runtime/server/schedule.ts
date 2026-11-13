// Scheduled publishing: a job per entry and action, due at the scheduled time. A scheduled publish pins
// the version chosen when it was scheduled, so later draft edits aren't published with it; scheduling
// again (the same key) replaces it, which is how an editor schedules a newer draft instead.
import type { AuditLog } from './auth/audit'
import type { EntryStore } from './db/store'
import type { Job, JobQueue } from './jobs'

export type ScheduleAction = 'publish' | 'unpublish'

/** An `atelier:schedule` job's payload. `version` is the pinned version of a publish. */
export interface Scheduled {
  type: string
  /** The entry id, or a singleton's name. */
  id: string
  singleton: boolean
  action: ScheduleAction
  version?: number
  /** Who scheduled it, recorded as the actor in the audit log. */
  by: string | null
  /** With sites: the site it's on. */
  site?: string
}

export const SCHEDULE_JOB = 'atelier:schedule'
export const scheduleKey = (type: string, id: string, action: ScheduleAction) => `${SCHEDULE_JOB}:${type}:${id}:${action}`

/** The scheduled publish and unpublish of an entry, with when they're due and how they went. */
export async function schedulesOf(queue: JobQueue, type: string, id: string) {
  const jobs = await Promise.all((['publish', 'unpublish'] as const).map(action => queue.byKey(scheduleKey(type, id, action))))
  return jobs.filter((job): job is Job => !!job).map(job => ({
    action: (job.payload as unknown as Scheduled).action,
    at: job.runAt,
    ...(job.payload as unknown as Scheduled).version === undefined ? {} : { version: (job.payload as unknown as Scheduled).version },
    by: (job.payload as unknown as Scheduled).by,
    status: job.status,
    lastError: job.lastError,
  }))
}

/** Runs a scheduled publish or unpublish, recording it in the audit log as the person who scheduled it. */
export async function runScheduled(store: EntryStore, audit: AuditLog, job: Scheduled): Promise<void> {
  if (job.action === 'publish') {
    await store.publishVersion(job.type, job.id, job.version!, job.by)
    await audit.record({ action: 'entry.published', actorId: job.by, target: { type: job.type, id: job.id }, details: { version: job.version, scheduled: true } })
    return
  }
  await (job.singleton ? store.unpublishSingleton(job.type, job.by) : store.unpublish(job.type, job.id, job.by))
  await audit.record({ action: 'entry.unpublished', actorId: job.by, target: { type: job.type, id: job.id }, details: { scheduled: true } })
}
