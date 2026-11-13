// Site search, over published content visitors may read:
//   GET   /api/_atelier/search?q=<text>&types=posts,pages&locale=de&limit=10&offset=0
//         { items: [{ type, id, locale?, title, path, excerpt (HTML, matches in <mark>), score }], total }
//   GET   /api/_atelier/search/admin?q=<text>   the admin's global search, signed in: entries (drafts too) by
//         title in the types the user reads, singletons by name, media by title or file name, users (for those
//         who manage them): { results: [{ kind, type?, id, title, detail? }] }, at most 5 of each type
//   POST  /api/_atelier/search/rebuild     indexes everything again: administrators, or the jobs secret
//         (`Authorization: Bearer <NUXT_ATELIER_JOBS_SECRET>`, as `atelier search rebuild` sends it)
// The query is plain text (at most 200 characters, 10 words): operators and quotes are never interpreted.
// Searches are rate limited per address.
import type { RequestEvent } from 'nuxt/server'
import * as v from 'valibot'
import { defineEventHandler, getQuery, getRequestHeader } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { clientIp } from '../auth/rate-limit'
import { apiError, validated } from '../errors'
import { assertMigrated, audit, useAtelierAuth, useAtelierEntries, useAtelierMedia, useAtelierRateLimiter, useAtelierSchema, useAtelierServerConfig } from '../index'
import { caller, segments } from '../content-access'
import { rebuildSearchIndex, searchSite } from '../search/service'
import { MAX_QUERY } from '../search/text'

const count = (name: string, max: number) => v.optional(v.pipe(v.string(), v.regex(/^\d+$/, `${name}: expected a whole number`), v.transform(Number), v.maxValue(max, `${name}: at most ${max}`)))
const Query = v.object({
  q: v.pipe(v.string('q: expected the text to search for'), v.maxLength(MAX_QUERY, `q: at most ${MAX_QUERY} characters`)),
  types: v.optional(v.pipe(v.string(), v.maxLength(1000), v.transform(t => t.split(',').map(s => s.trim()).filter(Boolean)))),
  locale: v.optional(v.pipe(v.string(), v.maxLength(35))),
  limit: count('limit', 50),
  offset: count('offset', 10_000),
})

const encoder = new TextEncoder()
const same = async (a: string, b: string) => {
  const [x, y] = await Promise.all([a, b].map(async s => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))))
  return x!.every((byte, i) => byte === y![i])
}

export default defineEventHandler(async (event) => {
  const [action] = segments(event, '/api/_atelier/search')
  const method = event.req.method
  await assertMigrated()

  if (action === 'rebuild' && method === 'POST') {
    const secret = (useAtelierServerConfig() as unknown as { jobs: { secret: string } }).jobs.secret
    const bearer = /^Bearer (.+)$/i.exec(getRequestHeader(event, 'authorization') ?? '')?.[1]?.trim()
    const user = bearer ? undefined : await (await useAtelierAuth()).getUser(event)
    if (!(bearer && secret && await same(bearer, secret)) && user?.role !== ADMIN_ROLE)
      throw apiError(user || bearer ? 403 : 401, 'Rebuilding the search index takes an administrator, or the jobs secret')
    const result = await rebuildSearchIndex()
    if (user)
      await audit(event, { action: 'search.rebuilt', actorId: user.id, details: result })
    return result
  }
  if (action === 'admin' && method === 'GET')
    return adminSearch(event)
  if (action || method !== 'GET')
    throw apiError(action ? 404 : 405, action ? 'Not found' : 'Method not allowed')

  const query = validated(Query, getQuery(event))
  const limiter = await useAtelierRateLimiter()
  const { trustProxy } = useAtelierServerConfig().auth as { trustProxy: boolean }
  const limits = [{ key: `search:${clientIp(event, trustProxy)}`, max: 60, window: 60 }]
  await limiter.check(event, limits)
  await limiter.hit(limits)
  const limit = query.limit ?? 10
  const offset = query.offset ?? 0
  return { ...await searchSite(query.q, { types: query.types, locale: query.locale, limit, offset }), limit, offset }
})

const PER_TYPE = 5
const TITLE_KEYS = ['title', 'name', 'label', 'headline']
const TEXT = new Set(['text', 'slug', 'email', 'url', 'textarea'])
const humanize = (name: string) => name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase()

export interface AdminSearchResult {
  kind: 'entry' | 'singleton' | 'media' | 'user'
  /** The collection or singleton. */
  type?: string
  id: string
  title: string
  detail?: string
}

/** The admin's global search: what the signed-in user may read, matching by title. */
async function adminSearch(event: RequestEvent): Promise<{ results: AdminSearchResult[] }> {
  const who = await caller(event)
  const { q } = validated(v.object({ q: v.pipe(v.string('q: expected the text to search for'), v.maxLength(MAX_QUERY, `q: at most ${MAX_QUERY} characters`)) }), getQuery(event))
  const text = q.trim()
  if (!text)
    return { results: [] }
  const needle = text.toLowerCase()
  const { principal, policy } = who
  const { collections, singletons } = await useAtelierSchema()
  const entries = await useAtelierEntries()
  const results: AdminSearchResult[] = []

  // entries, by their title field (a field the user may read)
  const found = await Promise.all(Object.entries(collections).map(async ([name, definition]) => {
    if (!policy.can(principal, 'read', name))
      return []
    const hidden = policy.fields(principal, name).hidden
    const key = TITLE_KEYS.find(k => k in definition.fields && !hidden.has(k))
      ?? Object.entries(definition.fields).find(([k, f]) => TEXT.has(f.type) && !hidden.has(k))?.[0]
    if (!key)
      return []
    const own = policy.ownOnly(principal, 'read', name) ? { createdBy: principal.id } : {}
    const page = await entries.list(name, { stage: 'draft', filter: { [key]: { contains: text } }, sort: ['-_updatedAt'], limit: PER_TYPE, ...own })
    return page.items.map(e => ({ kind: 'entry' as const, type: name, id: e.id, title: String(e.data[key] ?? ''), ...e.locale ? { detail: e.locale } : {} }))
  }))
  results.push(...found.flat())

  for (const [name, definition] of Object.entries(singletons)) {
    const label = definition.label ?? humanize(name)
    if (policy.can(principal, 'read', name) && (label.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)))
      results.push({ kind: 'singleton', type: name, id: name, title: label })
  }

  // media, by title or file name: everyone signed in may browse the library
  const media = await (await useAtelierMedia()).list({ filter: { or: [{ title: { contains: text } }, { filename: { contains: text } }] }, limit: PER_TYPE })
  results.push(...media.items.map(m => ({ kind: 'media' as const, id: m.id, title: m.title || m.filename, detail: m.filename })))

  if (policy.can(principal, 'manage', 'users')) {
    const users = (await (await useAtelierAuth()).users.list())
      .filter(u => u.email.toLowerCase().includes(needle) || (u.name ?? '').toLowerCase().includes(needle))
      .slice(0, PER_TYPE)
    results.push(...users.map(u => ({ kind: 'user' as const, id: u.id, title: u.name || u.email, detail: u.email })))
  }
  return { results }
}
