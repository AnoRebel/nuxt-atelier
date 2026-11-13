// Site search, over published content visitors may read:
//   GET   /api/_atelier/search?q=<text>&types=posts,pages&locale=de&limit=10&offset=0
//         { items: [{ type, id, locale?, title, path, excerpt (HTML, matches in <mark>), score }], total }
//   POST  /api/_atelier/search/rebuild     indexes everything again: administrators, or the jobs secret
//         (`Authorization: Bearer <NUXT_ATELIER_JOBS_SECRET>`, as `atelier search rebuild` sends it)
// The query is plain text (at most 200 characters, 10 words): operators and quotes are never interpreted.
// Searches are rate limited per address.
import * as v from 'valibot'
import { defineEventHandler, getQuery, getRequestHeader } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { clientIp } from '../auth/rate-limit'
import { segments } from '../content-access'
import { apiError, validated } from '../errors'
import { assertMigrated, audit, useAtelierAuth, useAtelierRateLimiter, useAtelierServerConfig } from '../index'
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
