// Background jobs:
//   POST  /api/_atelier/jobs/run           runs due jobs for `jobs.triggerBudget` seconds: for an external scheduler,
//                                         with `Authorization: Bearer <NUXT_ATELIER_JOBS_SECRET>`. 404 while no secret is set.
//                                         GET too, for Vercel Cron, which sends Vercel's CRON_SECRET: set both to one value.
//   GET   /api/_atelier/jobs?status=failed  jobs, newest first (administrators)
//   POST  /api/_atelier/jobs/<id>/retry     queues a failed job again (administrators)
import * as v from 'valibot'
import { defineEventHandler, getQuery, getRequestHeader } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { apiError, validated } from '../errors'
import { assertMigrated, requireUser, useAtelierJobs, useAtelierServerConfig } from '../index'
import { segments } from '../content-access'

const encoder = new TextEncoder()

/** Equal strings, compared in constant time for equal lengths. */
async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map(async s => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))))
  return x!.every((byte, i) => byte === y![i])
}

const Query = v.object({
  status: v.optional(v.picklist(['queued', 'running', 'failed'], 'status: expected queued, running or failed')),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'limit: expected a whole number'), v.transform(Number))),
})

export default defineEventHandler(async (event) => {
  const [first, action, ...rest] = segments(event, '/api/_atelier/jobs')
  const method = event.req.method
  const config = useAtelierServerConfig() as unknown as { jobs: { secret: string, triggerBudget: number } }
  if (first === 'run' && !action && (method === 'POST' || method === 'GET')) {
    const secret = config.jobs.secret
    if (!secret)
      throw apiError(404, 'Not found') // no trigger without a secret
    const given = /^Bearer (.+)$/i.exec(getRequestHeader(event, 'authorization') ?? '')?.[1]?.trim()
    if (!given || !await same(given, secret))
      throw apiError(401, 'Send the jobs secret as Authorization: Bearer <NUXT_ATELIER_JOBS_SECRET>')
    await assertMigrated()
    return (await useAtelierJobs()).run({ budgetMs: config.jobs.triggerBudget * 1000 })
  }
  if (rest.length)
    throw apiError(404, 'Not found')
  const user = await requireUser(event)
  if (user.role !== ADMIN_ROLE)
    throw apiError(403, 'Only administrators can see background jobs')
  const jobs = await useAtelierJobs()
  if (!first && method === 'GET')
    return jobs.list(validated(Query, getQuery(event)))
  if (first && action === 'retry' && method === 'POST') {
    await assertMigrated()
    if (!await jobs.retry(first))
      throw apiError(404, `No failed job "${first}"`)
    return jobs.get(first)
  }
  throw apiError(method === 'GET' || method === 'POST' ? 404 : 405, method === 'GET' || method === 'POST' ? 'Not found' : `${method} isn't allowed here`)
})
