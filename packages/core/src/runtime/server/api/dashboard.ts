// The admin home's widgets, for the signed-in user, in one request:
//   GET /api/_atelier/dashboard
//   drafts             their own entries with unsaved-to-the-site changes, in types they may update (newest first)
//   scheduled          upcoming scheduled publishes and unpublishes, in types they may read (soonest first)
//   activity           the latest audit log entries          (administrators)
//   failedJobs         failed background jobs, with retry     (administrators)
//   pendingMigrations  migrations not applied yet            (administrators)
import type { Scheduled } from '../schedule'
import { defineEventHandler } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { caller } from '../content-access'
import { pendingMigrations } from '../db/state'
import { apiError } from '../errors'
import { useAtelierAudit, useAtelierDatabase, useAtelierEntries, useAtelierJobs, useAtelierSchema, useAtelierSite } from '../index'
import { SCHEDULE_JOB } from '../schedule'

const LIMIT = 10

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET')
    throw apiError(405, 'Method not allowed')
  const { principal: user, policy } = await caller(event)
  const admin = user.role === ADMIN_ROLE
  // with migrations pending, content can't be read: say so, which is what an administrator needs to know
  const pending = import.meta.dev ? 0 : (await pendingMigrations(useAtelierDatabase)).length
  if (pending)
    return { drafts: [], scheduled: [], ...admin ? { activity: [], failedJobs: [], pendingMigrations: pending } : {} }

  const { collections, singletons } = await useAtelierSchema()
  const entries = await useAtelierEntries(useAtelierSite(event))
  const jobs = await useAtelierJobs()

  const drafts = (await Promise.all(Object.entries(collections)
    .filter(([name, definition]) => definition.versioned && policy.can(user, 'update', name))
    .map(async ([name]) => (await entries.list(name, { createdBy: user.id, stage: 'draft', sort: ['-_updatedAt'], limit: LIMIT })).items
      .filter(e => e.publishedVersion !== e.version)
      .map(e => ({ type: name, id: e.id, version: e.version, publishedVersion: e.publishedVersion, updatedAt: e.updatedAt, data: policy.readable(user, name, e.data) })))))
    .flat()
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMIT)

  // ponytail: reads the latest 200 queued schedules and sorts them here; a runAt-ordered query when sites schedule more
  const scheduled = (await jobs.list({ status: 'queued', name: SCHEDULE_JOB, limit: 200 }))
    .map(job => ({ ...job.payload as unknown as Scheduled, runAt: job.runAt }))
    .filter(s => (s.singleton ? s.type in singletons : s.type in collections) && policy.can(user, 'read', s.type))
    .toSorted((a, b) => a.runAt.localeCompare(b.runAt))
    .slice(0, LIMIT)
    .map(({ type, id, singleton, action, version, runAt }) => ({ type, id, singleton, action, ...version === undefined ? {} : { version }, runAt }))

  return {
    drafts,
    scheduled,
    ...admin
      ? {
          activity: await (await useAtelierAudit()).list({ limit: LIMIT }),
          failedJobs: (await jobs.list({ status: 'failed', limit: LIMIT })).map(({ id, name, lastError, attempts, runAt }) => ({ id, name, lastError, attempts, runAt })),
          pendingMigrations: 0,
        }
      : {},
  }
})
