// Starting points to copy from, for signed-in users:
//   GET  /api/_atelier/patterns           [{ id, label, description, source, blocks }]: block arrangements to insert
//   GET  /api/_atelier/templates/<type>   [{ id, label, description, source, data }]: to start a new entry from
// `source` is `code` (patterns.ts, a collection's `templates`) or `saved` (the atelier-patterns and
// atelier-templates collections). Blocks come with fresh ids on every request: what's inserted is a copy,
// with no link back.
import { defineEventHandler } from 'nuxt/server'
import { copyBlocks } from '../../shared/blocks'
import { allow, caller, segments } from '../content-access'
import { apiError } from '../errors'
import { useAtelierEntries, useAtelierSchema } from '../index'

const PATTERNS = 'atelier-patterns'
const TEMPLATES = 'atelier-templates'

export default defineEventHandler(async (event) => {
  const [kind, type, ...rest] = segments(event, '/api/_atelier/')
  if (event.req.method !== 'GET' || rest.length)
    throw apiError(404, 'Not found')
  const who = await caller(event)
  const schema = await useAtelierSchema()
  const entries = await useAtelierEntries()
  /** The saved ones, when the caller may read them (every page, they're few). */
  const saved = async (name: string, filter?: Record<string, unknown>) => {
    if (!schema.collections[name] || !who.policy.can(who.principal, 'read', name))
      return []
    const items = []
    let cursor: string | undefined
    do {
      const page = await entries.list(name, { stage: 'draft', limit: 100, cursor, sort: ['title'], ...filter ? { filter } : {} })
      items.push(...page.items)
      cursor = page.next ?? undefined
    } while (cursor)
    return items
  }

  if (kind === 'patterns' && !type) {
    const { patterns } = await import('#atelier-schema')
    return [
      ...Object.entries(patterns ?? {}).map(([name, p]) => ({ id: `code:${name}`, label: p.label ?? name, description: p.description ?? null, source: 'code', blocks: copyBlocks(p.blocks) })),
      ...(await saved(PATTERNS)).map(e => ({ id: e.id, label: String(e.data.title), description: e.data.description ?? null, source: 'saved', blocks: copyBlocks(e.data.blocks) })),
    ]
  }
  if (kind === 'templates' && type) {
    const definition = schema.collections[type]
    if (!definition)
      throw apiError(404, `No collection "${type}"`)
    allow(who, 'create', type)
    return [
      ...Object.entries(definition.templates ?? {}).map(([name, t]) => ({ id: `code:${name}`, label: t.label ?? name, description: t.description ?? null, source: 'code', data: copyBlocks(t.data) })),
      ...(await saved(TEMPLATES, { type: { eq: type } })).map(e => ({ id: e.id, label: String(e.data.title), description: e.data.description ?? null, source: 'saved', data: copyBlocks(e.data.data) })),
    ]
  }
  throw apiError(404, 'Not found')
})
