// The schedule endpoints shared by collection entries and singletons (see schedule.ts).
import type { RequestEvent } from 'nuxt/server'
import type { Caller } from './content-access'
import type { Scheduled } from './schedule'
import * as v from 'valibot'
import { allow } from './content-access'
import { apiError, readValid } from './errors'
import { useAtelierEntries, useAtelierJobs, useAtelierSite } from './index'
import { SCHEDULE_JOB, scheduleKey, schedulesOf } from './schedule'

const Body = v.object({
  action: v.picklist(['publish', 'unpublish'], 'action: expected publish or unpublish'),
  // an absolute time: UTC (Z) or with its offset, so it means the same instant everywhere
  at: v.pipe(v.string('at: expected a date and time'), v.regex(/(?:Z|[+-]\d\d:\d\d)$/, 'at: expected a date and time with its offset, like 2026-11-10T09:00:00+02:00 or …Z'), v.check(at => !Number.isNaN(Date.parse(at)), 'at: expected a valid date and time')),
  version: v.optional(v.pipe(v.number('version: expected a version number'), v.integer())),
})

/**
 * The schedule endpoints of an entry or singleton (`…/schedule`, `…/schedule/<action>`), after the caller's
 * permission to see it was checked:
 *   GET     the scheduled publish and unpublish                      (update)
 *   POST    { action, at, version }: schedules one, replacing any    (publish; `version` pins a publish)
 *   DELETE  /<action>: cancels it                                    (publish)
 */
export async function scheduleRequest(event: RequestEvent, who: Caller, target: { type: string, id: string, singleton: boolean, versioned: boolean }, action: string | undefined) {
  const queue = await useAtelierJobs()
  const { type } = target
  const site = useAtelierSite(event)
  // a singleton's schedules are per site (each site has its own); entries' ids are unique anyway
  const id = target.singleton && site.scoped ? `${target.id}@${site.name}` : target.id
  const method = event.req.method
  if (method === 'GET' && !action) {
    allow(who, 'update', type)
    return schedulesOf(queue, type, id)
  }
  allow(who, 'publish', type)
  if (!target.versioned)
    throw apiError(422, `"${type}" isn't versioned: every save is published`, { errors: [{ path: '', message: 'not versioned' }] })
  if (method === 'POST' && !action) {
    const body = await readValid(event, Body)
    if (Date.parse(body.at) <= Date.now())
      throw apiError(422, 'Schedule it for a time in the future', { errors: [{ path: 'at', message: 'in the past' }] })
    if (body.action === 'publish') {
      if (body.version === undefined)
        throw apiError(422, 'Say which version to publish: the draft version you read', { errors: [{ path: 'version', message: 'required' }] })
      if (!await (await useAtelierEntries(site)).revision(type, target.id, body.version))
        throw apiError(422, `There's no version ${body.version} to publish`, { errors: [{ path: 'version', message: 'not in the history' }] })
    }
    const job: Scheduled = { type, id: target.id, singleton: target.singleton, action: body.action, ...body.action === 'publish' ? { version: body.version } : {}, by: who.principal.id, ...site.scoped ? { site: site.name } : {} }
    await queue.enqueue(SCHEDULE_JOB, job as unknown as Record<string, unknown>, { key: scheduleKey(type, id, body.action), runAt: body.at, maxAttempts: 3 })
    return schedulesOf(queue, type, id)
  }
  if (method === 'DELETE' && (action === 'publish' || action === 'unpublish')) {
    if (!await queue.cancel(scheduleKey(type, id, action)))
      throw apiError(404, `Nothing is scheduled to ${action}`)
    return schedulesOf(queue, type, id)
  }
  throw apiError(405, `${method} isn't allowed here`)
}
