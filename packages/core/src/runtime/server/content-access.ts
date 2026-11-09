// Shared by the collection and singleton endpoints: who's asking, what they may see, and limits.
import type { RequestEvent } from 'nuxt/server'
import type { Field, RelationField } from '../shared/fields'
import type { ContentAction, Policy, PolicyUser } from '../shared/policy'
import type { Entry, EntryStore } from './db/store'
import { getRequestHeader, getRequestURL } from 'nuxt/server'
import { createPolicy, PUBLIC_ROLE } from '../shared/policy'
import { apiError } from './errors'
import { assertMigrated, useAtelierAuth, useAtelierPolicy, useAtelierRateLimiter, useAtelierRoles, useAtelierSchema, useAtelierServerConfig, useAtelierTokens } from './index'

export interface Caller {
  principal: PolicyUser
  policy: Policy
}

interface Limits { maxPageSize: number, maxRelationDepth: number, writesPerMinute: number }
export const limits = () => (useAtelierServerConfig() as unknown as { limits: Limits }).limits

/**
 * Who's asking, with the policy to check them against: an API token (`Authorization: Bearer atk_…`),
 * whose permissions act as its own role, or the signed-in user. Neither is a visitor with the public role
 * when `visitors` allows it (reads), and a 401 otherwise.
 */
export async function caller(event: RequestEvent, visitors = false): Promise<Caller> {
  const bearer = /^Bearer (.+)$/i.exec(getRequestHeader(event, 'authorization') ?? '')?.[1]
  if (bearer) {
    const token = await (await useAtelierTokens()).verify(bearer.trim())
    if (!token)
      throw apiError(401, 'This API token is invalid, expired or revoked')
    const role = `token:${token.id}` // not a valid role name, so it can't clash with a real one
    const policy = createPolicy({ ...await (await useAtelierRoles()).roles(), [role]: { content: token.permissions } })
    return { principal: { id: role, role }, policy }
  }
  const user = await (await useAtelierAuth()).getUser(event)
  if (!user && !visitors)
    throw apiError(401, 'Sign in first')
  return { principal: user ?? { id: '', role: PUBLIC_ROLE }, policy: await useAtelierPolicy() }
}

/**
 * Which copy a read sees: drafts when asked for (`?draft=true`) by someone who can edit this type (the
 * preview permission), and what the site serves otherwise. Visitors never see drafts.
 */
export function stageFor(who: Caller, resource: string, draft: string | undefined): 'draft' | 'published' {
  const asked = draft === 'true' || draft === '1'
  return asked && who.principal.role !== PUBLIC_ROLE && who.policy.can(who.principal, 'update', resource) ? 'draft' : 'published'
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

/**
 * A save through one side of a two-way relation also changes the entries on the other side: 403 unless
 * the caller may update each of them and write their inverse field. When the inverse holds one entry,
 * linking moves it, so the entry it pointed to (in this collection) must be updatable too.
 */
export async function assertInversesWritable(who: Caller, entries: EntryStore, name: string, id: string | undefined, fields: Record<string, Field>, data: Record<string, unknown>, before?: Record<string, unknown>) {
  const schema = await useAtelierSchema()
  const ids = (value: unknown): string[] => value == null ? [] : Array.isArray(value) ? value as string[] : [value as string]
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'relation' || !field.inverse || !(key in data))
      continue
    const old = new Set(ids(before?.[key]))
    const now = new Set(ids(data[key]))
    const changed = [...old.symmetricDifference(now)]
    const inverse = schema.collections[field.to]!.fields[field.inverse] as RelationField
    for (const otherId of changed) {
      const other = await entries.get(field.to, otherId, { stage: 'draft' })
      if (!other)
        continue // validation reports a missing entry
      allow(who, 'update', field.to, other)
      const after = now.has(otherId) ? 'linked' : 'unlinked'
      if (who.policy.unwritable(who.principal, field.to, { [field.inverse]: after }, { [field.inverse]: null }).length)
        throw apiError(403, `Your role can't change ${field.inverse} in "${field.to}", which this change updates`, { fields: [field.inverse] })
      const previous = other.data[field.inverse]
      if (!inverse.many && now.has(otherId) && typeof previous === 'string' && previous !== id) {
        const moved = await entries.get(name, previous, { stage: 'draft' })
        if (moved)
          allow(who, 'update', name, moved)
      }
    }
  }
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

/**
 * A revision's data to restore as the new draft: the caller's hidden and read-only fields keep their
 * current values, since restoring them would be writing them.
 */
export function restorable(who: Caller, resource: string, revision: Record<string, unknown>, current: Record<string, unknown> = {}): Record<string, unknown> {
  const { hidden, readOnly } = who.policy.fields(who.principal, resource)
  const kept = new Set([...hidden, ...readOnly])
  return Object.fromEntries([
    ...Object.entries(revision).filter(([key]) => !kept.has(key)),
    ...Object.entries(current).filter(([key]) => kept.has(key)),
  ])
}

/** Only the named fields of `data`; all of it without a selection. */
export const select = (data: Record<string, unknown>, fields: string[] | undefined) =>
  fields ? Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))) : data

/** The path segments after `prefix`, decoded. */
export function segments(event: RequestEvent, prefix: string): string[] {
  return getRequestURL(event).pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent)
}

export { assertMigrated }
