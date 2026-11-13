// AI assist, for signed-in users with the `ai` capability (404 everywhere while no adapter is registered):
//   GET   /api/_atelier/ai             { enabled: true }: whether the admin offers AI actions
//   POST  /api/_atelier/ai/suggest     { action, … }: a suggestion, never saved
//           rewrite | shorten | expand   { type, field, text, locale? }  → { suggestion: string }
//           translate                    { type, field, value, to, from? } → { suggestion: value in `to` }
//           seo                          { type, id, locale? }            → { suggestion: { title, description } }
//           alt                          { media, locale? }               → { suggestion: string }
//   POST  /api/_atelier/ai/assistant   { request }: proposed content API requests, for the user to approve
//   GET   /api/_atelier/ai/usage?from&to   requests and tokens per user and action (for those who manage users)
// What's excluded (`atelierAi.exclude`) and what the user can't read never reaches the provider.
import type { RequestEvent } from 'nuxt/server'
import type { AuthUser } from '#atelier/server'
import { and, gte, lte, sql } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import * as v from 'valibot'
import { apiError, readValid, requireUser, useAtelierAuth, useAtelierDatabase, useAtelierEntries, useAtelierMedia, useAtelierPolicy, useAtelierRateLimiter, useAtelierSchema, useAtelierSite, useAtelierStorage, useAtelierTables, validated } from '#atelier/server'
import { useAiAdapter } from './adapter'
import { altPrompt, assistantPrompt, excluded, mergeTranslation, parseProposals, parseSeo, seoPrompt, textPrompt, translatePrompt } from './prompts'

interface AiConfig { exclude: string[] | string, requestsPerHour: number, tokensPerDay: number }
const config = () => {
  const c = useRuntimeConfig().atelierAi as AiConfig
  return { ...c, exclude: typeof c.exclude === 'string' ? JSON.parse(c.exclude || '[]') as string[] : c.exclude }
}

const locale = v.optional(v.pipe(v.string(), v.regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i, 'expected a locale code')))
const Suggest = v.variant('action', [
  v.object({ action: v.picklist(['rewrite', 'shorten', 'expand']), type: v.string(), field: v.string(), text: v.pipe(v.string(), v.nonEmpty('text: nothing to work on'), v.maxLength(20_000)), locale }),
  v.object({ action: v.literal('translate'), type: v.string(), field: v.string(), value: v.unknown(), to: v.pipe(v.string(), v.regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i, 'to: expected a locale code')), from: locale }),
  v.object({ action: v.literal('seo'), type: v.string(), id: v.optional(v.string()), locale }),
  v.object({ action: v.literal('alt'), media: v.string(), locale }),
], 'action: expected rewrite, shorten, expand, translate, seo or alt')
const Assistant = v.object({ request: v.pipe(v.string(), v.trim(), v.nonEmpty('request: say what you need'), v.maxLength(2000)) })
const Period = v.object({ from: v.optional(v.pipe(v.string(), v.isoDate())), to: v.optional(v.pipe(v.string(), v.isoDate())) })

/** The plain text of a value: a string, or the text inside rich text and blocks. */
const plainText = (value: unknown): string => typeof value === 'string'
  ? value
  : Array.isArray(value)
    ? value.map(plainText).filter(Boolean).join(' ')
    : value && typeof value === 'object' ? Object.entries(value).filter(([k]) => k !== 'id' && k !== 'type').map(([, v2]) => plainText(v2)).filter(Boolean).join(' ') : ''

async function usageTable() {
  const tables = await useAtelierTables()
  return { db: (await useAtelierDatabase()).db, table: tables.atelier_ai_usage }
}

/** 429 past the user's requests per hour or tokens per day. */
async function limit(event: RequestEvent, user: AuthUser) {
  const { requestsPerHour, tokensPerDay } = config()
  const limits = [{ key: `ai:${user.id}`, max: requestsPerHour, window: 3600 }]
  const limiter = await useAtelierRateLimiter()
  await limiter.check(event, limits)
  const { db, table } = await usageTable()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const [used] = await db.select({ tokens: sql<number>`coalesce(sum(${table.input_tokens} + ${table.output_tokens}), 0)` }).from(table)
    .where(and(sql`${table.user_id} = ${user.id}`, gte(table.created_at, since)))
  if (Number(used?.tokens ?? 0) >= tokensPerDay)
    throw apiError(429, 'You\'ve used today\'s AI allowance: try again tomorrow')
  await limiter.hit(limits)
}

async function record(event: RequestEvent, user: AuthUser, action: string, type: string | null, usage: { inputTokens?: number, outputTokens?: number } | undefined) {
  const { db, table } = await usageTable()
  await db.insert(table).values({ id: crypto.randomUUID(), user_id: user.id, action, content_type: type, site: useAtelierSite(event).name, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0, created_at: new Date().toISOString() })
}

export default defineEventHandler(async (event) => {
  const adapter = useAiAdapter()
  const action = getRequestURL(event).pathname.replace(/^\/api\/_atelier\/ai\/?/, '').replace(/\/$/, '')
  if (!adapter)
    throw apiError(404, 'AI assist isn\'t set up')
  const user = await requireUser(event, 'ai')
  const method = event.req.method
  const { exclude } = config()
  const schema = await useAtelierSchema()
  const policy = await useAtelierPolicy()
  /** 404 for a type the user can't read, 403 for an excluded or hidden one. */
  const allowed = (type: string, field?: string) => {
    const definition = schema.collections[type] ?? schema.singletons[type]
    if (!definition || !policy.can(user, 'read', type))
      throw apiError(404, `No content type "${type}"`)
    if (field !== undefined && (!definition.fields[field] || policy.fields(user, type).hidden.has(field)))
      throw apiError(404, `No field "${field}" in "${type}"`)
    if (excluded(exclude, type, field))
      throw apiError(403, `${field ? `"${type}.${field}"` : `"${type}"`} is excluded from AI assist`)
    return definition
  }

  if (!action && method === 'GET')
    return { enabled: true }

  if (action === 'suggest' && method === 'POST') {
    const input = await readValid(event, Suggest)
    await limit(event, user)
    const ai = await adapter
    if (input.action === 'rewrite' || input.action === 'shorten' || input.action === 'expand') {
      const definition = allowed(input.type, input.field)
      const label = (definition.fields[input.field] as { label?: string }).label ?? input.field
      const result = await ai.generate(textPrompt(input.action, input.text, { label, locale: input.locale }))
      await record(event, user, input.action, input.type, result.usage)
      return { suggestion: result.text.trim() }
    }
    if (input.action === 'translate') {
      allowed(input.type, input.field)
      const result = await ai.generate({ ...translatePrompt(input.value, input.to, input.from), maxOutputTokens: 4096 })
      await record(event, user, 'translate', input.type, result.usage)
      return { suggestion: typeof input.value === 'string' ? result.text.trim() : mergeTranslation(input.value, result.text) }
    }
    if (input.action === 'seo') {
      const definition = allowed(input.type)
      // the entry as stored, not what the browser says it is: only fields this user may read and AI may see
      const entries = await useAtelierEntries(useAtelierSite(event))
      const entry = schema.singletons[input.type] ? await entries.getSingleton(input.type, { stage: 'draft' }) : input.id ? await entries.get(input.type, input.id, { stage: 'draft' }) : undefined
      if (!entry)
        throw apiError(404, 'No such entry')
      const hidden = policy.fields(user, input.type).hidden
      const texts = Object.fromEntries(Object.entries(definition.fields)
        .filter(([key, field]) => ['text', 'textarea', 'richText', 'blocks'].includes(field.type) && !hidden.has(key) && !excluded(exclude, input.type, key))
        .map(([key, field]) => [(field as { label?: string }).label ?? key, plainText(entry.data[key]).slice(0, 4000)])
        .filter(([, text]) => text))
      if (!Object.keys(texts).length)
        throw apiError(422, 'There\'s no text to write a title and description from')
      const result = await ai.generate(seoPrompt(texts, input.locale))
      await record(event, user, 'seo', input.type, result.usage)
      return { suggestion: parseSeo(result.text) }
    }
    // alt text: the image itself, from storage
    if (exclude.includes('media'))
      throw apiError(403, 'Media is excluded from AI assist')
    const item = await (await useAtelierMedia(useAtelierSite(event))).get(input.media)
    if (!item)
      throw apiError(404, 'No such media item')
    if (!item.mime.startsWith('image/') || item.size > 5 * 1024 * 1024)
      throw apiError(422, 'Alt text needs an image of at most 5 MB')
    const file = await (await useAtelierStorage()).get(item.key)
    if (!file)
      throw apiError(404, 'The file is missing from storage')
    const data = new Uint8Array(await new Response(file.stream).arrayBuffer())
    const result = await ai.generate({ ...altPrompt(item.filename, input.locale), images: [{ data, mediaType: item.mime }] })
    await record(event, user, 'alt', null, result.usage)
    return { suggestion: result.text.trim().slice(0, 300) }
  }

  if (action === 'assistant' && method === 'POST') {
    const { request } = await readValid(event, Assistant)
    await limit(event, user)
    const describe = (kind: 'collection' | 'singleton') => ([name, d]: [string, { fields: Record<string, unknown> }]) => ({
      name,
      kind,
      fields: Object.keys(d.fields).filter(key => !policy.fields(user, name).hidden.has(key) && !excluded(exclude, name, key)),
      actions: ['read', 'create', 'update', 'delete', 'publish'].filter(a => policy.can(user, a as never, name)),
    })
    const types = [
      ...Object.entries(schema.collections).filter(([name]) => policy.can(user, 'read', name) && !excluded(exclude, name)).map(describe('collection')),
      ...Object.entries(schema.singletons).filter(([name]) => policy.can(user, 'read', name) && !excluded(exclude, name)).map(describe('singleton')),
    ]
    const result = await (await adapter).generate({ ...assistantPrompt(request, types), maxOutputTokens: 2048 })
    await record(event, user, 'assistant', null, result.usage)
    return { proposals: parseProposals(result.text) }
  }

  if (action === 'usage' && method === 'GET') {
    if (!policy.can(user, 'manage', 'users'))
      throw apiError(403, 'Only those who manage users see AI usage')
    const { from, to } = validated(Period, getQuery(event))
    const { db, table } = await usageTable()
    const rows: { user_id: string, action: string, input_tokens: number, output_tokens: number }[] = await db.select().from(table)
      .where(and(from ? gte(table.created_at, from) : undefined, to ? lte(table.created_at, `${to}T23:59:59.999Z`) : undefined))
    const names = new Map((await (await useAtelierAuth()).users.list()).map(u => [u.id, u.name || u.email]))
    const groups = new Map<string, { userId: string, name: string, action: string, requests: number, inputTokens: number, outputTokens: number }>()
    for (const row of rows) {
      const key = `${row.user_id}\0${row.action}`
      const group = groups.get(key) ?? { userId: row.user_id, name: names.get(row.user_id) ?? row.user_id, action: row.action, requests: 0, inputTokens: 0, outputTokens: 0 }
      group.requests++
      group.inputTokens += Number(row.input_tokens)
      group.outputTokens += Number(row.output_tokens)
      groups.set(key, group)
    }
    return [...groups.values()].toSorted((a, b) => a.name.localeCompare(b.name) || a.action.localeCompare(b.action))
  }
  throw apiError(404, 'Not found')
})
