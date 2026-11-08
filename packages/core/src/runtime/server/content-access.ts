// Shared by the collection and singleton endpoints: who's asking, what they may see, and limits.
import type { RequestEvent } from 'nuxt/server'
import type { Field } from '../shared/fields'
import type { ContentAction, Policy, PolicyUser } from '../shared/policy'
import type { Entry } from './db/store'
import { getRequestURL } from 'nuxt/server'
import { apiError } from './errors'
import { assertMigrated, useAtelierAuth, useAtelierPolicy, useAtelierRateLimiter, useAtelierSchema, useAtelierServerConfig } from './index'

export interface Caller {
  principal: PolicyUser
  policy: Policy
}

interface Limits { maxPageSize: number, maxRelationDepth: number, writesPerMinute: number }
export const limits = () => (useAtelierServerConfig() as unknown as { limits: Limits }).limits

/** The signed-in caller with the current policy; 401 when nobody is. */
export async function caller(event: RequestEvent): Promise<Caller> {
  const user = await (await useAtelierAuth()).getUser(event)
  if (!user)
    throw apiError(401, 'Sign in first')
  return { principal: user, policy: await useAtelierPolicy() }
}

/** 403 unless the caller may do `action` on `resource` (and this entry, for own-only rules). */
export function allow(who: Caller, action: ContentAction, resource: string, entry?: { createdBy: string | null }) {
  if (!who.policy.can(who.principal, action, resource, entry))
    throw apiError(403, `Your role can't ${action} ${entry ? 'this entry in ' : ''}"${resource}"`)
}

/** 403 when the write changes fields the caller can't write, naming them. */
export function assertWritable(who: Caller, resource: string, data: Record<string, unknown>, before?: Record<string, unknown>) {
  const fields = who.policy.unwritable(who.principal, resource, data, before)
  if (fields.length)
    throw apiError(403, `Your role can't change ${fields.join(', ')}`, { fields })
}

/** Counts a write against the caller's per-minute limit; 429 once it's used up. */
export async function countWrite(event: RequestEvent, who: Caller) {
  const limiter = await useAtelierRateLimiter()
  const limit = [{ key: `write:${who.principal.id}`, max: limits().writesPerMinute, window: 60 }]
  await limiter.check(event, limit)
  await limiter.hit(limit)
}

/** Entry data as the caller may see it: hidden fields removed, here and in populated relations. */
export async function present(who: Caller, fields: Record<string, Field>, resource: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const schema = await useAtelierSchema()
  const visible = who.policy.readable(who.principal, resource, data)
  const walk = async (defs: Record<string, Field>, value: Record<string, unknown>) => {
    for (const [key, field] of Object.entries(defs)) {
      const v = value[key]
      if (field.type === 'relation') {
        const shape = async (item: unknown) => {
          if (!item || typeof item !== 'object')
            return item
          const entry = item as Entry
          // a related entry the caller can't read stays an id
          if (!who.policy.can(who.principal, 'read', field.to, entry))
            return entry.id
          return { ...entry, data: await present(who, schema.collections[field.to]!.fields, field.to, entry.data) }
        }
        value[key] = Array.isArray(v) ? await Promise.all(v.map(shape)) : await shape(v)
      }
      else if (field.type === 'object' && v && typeof v === 'object') {
        await walk(field.fields, v as Record<string, unknown>)
      }
      else if (field.type === 'repeater' && Array.isArray(v)) {
        for (const item of v)
          await walk(field.fields, item)
      }
    }
  }
  await walk(fields, visible)
  return visible
}

/** Only the named fields of `data`; all of it without a selection. */
export const select = (data: Record<string, unknown>, fields: string[] | undefined) =>
  fields ? Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))) : data

/** The path segments after `prefix`, decoded. */
export function segments(event: RequestEvent, prefix: string): string[] {
  return getRequestURL(event).pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent)
}

export { assertMigrated }
