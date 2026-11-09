// Collection entries:
//   GET     /api/_atelier/collections/<name>                       list: ?filter=<JSON>&sort=-date,title&fields=title,date&limit&offset&cursor&depth&draft
//   POST    /api/_atelier/collections/<name>                       { data, publish? }
//   GET     /api/_atelier/collections/<name>/<id>                  ?depth&fields&draft
//   PATCH   /api/_atelier/collections/<name>/<id>                  { version, data, publish? }: merged into the draft
//   DELETE  /api/_atelier/collections/<name>/<id>
//   POST    /api/_atelier/collections/<name>/<id>/publish          { version }: the draft at that version goes live
//   POST    /api/_atelier/collections/<name>/<id>/unpublish
//   GET     /api/_atelier/collections/<name>/<id>/schedule          the scheduled publish and unpublish
//   POST    /api/_atelier/collections/<name>/<id>/schedule          { action, at, version }: see schedule.ts
//   DELETE  /api/_atelier/collections/<name>/<id>/schedule/<action>
//   GET     /api/_atelier/collections/<name>/<id>/revisions
//   GET     /api/_atelier/collections/<name>/<id>/revisions/<version>
//   POST    /api/_atelier/collections/<name>/<id>/revisions/<version>/restore   { version }: that version's data becomes the next draft
// Reads return what the site serves; `draft=true` returns drafts to callers who can edit the type. Visitors
// who aren't signed in read with the public role. Writes save drafts; types that aren't versioned publish them.
import type { Filter } from '../db/query'
import type { Entry } from '../db/store'
import * as v from 'valibot'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { apiError, readValid, validated } from '../errors'
import { audit, toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { scheduleRequest } from '../scheduling'
import { shadowed } from '../shadowing'
import { allow, assertInversesWritable, assertMigrated, assertWritable, caller, countWrite, limits, present, restorable, segments, select, stageFor } from '../content-access'

const PREFIX = '/api/_atelier/collections'
const list = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean)
const count = (name: string) => v.optional(v.pipe(v.string(), v.regex(/^\d+$/, `${name}: expected a whole number`), v.transform(Number)))

const ListParams = v.object({
  filter: v.optional(v.pipe(v.string(), v.rawTransform(({ dataset, addIssue, NEVER }) => {
    try {
      return JSON.parse(dataset.value) as Filter
    }
    catch {
      addIssue({ message: 'filter: expected JSON, like {"category":{"eq":"news"}}' })
      return NEVER
    }
  }))),
  sort: v.optional(v.pipe(v.string(), v.transform(list))),
  fields: v.optional(v.pipe(v.string(), v.transform(list))),
  limit: count('limit'),
  offset: count('offset'),
  cursor: v.optional(v.string()),
  depth: count('depth'),
  draft: v.optional(v.string()),
})
const publishFlag = v.optional(v.boolean('publish: expected true or false'))
const Create = v.object({ data: v.record(v.string(), v.unknown()), publish: publishFlag })
const Update = v.object({ version: v.number('version: expected the version you read'), data: v.record(v.string(), v.unknown()), publish: publishFlag })
const AtVersion = v.object({ version: v.number('version: expected the version you read') })
const SUBS = new Set(['revisions', 'publish', 'unpublish', 'schedule'])

export default defineEventHandler(async (event) => {
  const [name, id, sub, version, action, ...rest] = segments(event, PREFIX)
  const method = event.req.method
  const schema = await useAtelierSchema()
  const definition = name ? schema.collections[name] : undefined
  if (!name || !definition || rest.length || (sub !== undefined && !SUBS.has(sub)) || (sub !== 'revisions' && sub !== 'schedule' && version !== undefined) || (action !== undefined && (sub !== 'revisions' || action !== 'restore')))
    throw apiError(404, name && !definition ? `No collection "${name}"` : 'Not found')
  if (method !== 'GET')
    await assertMigrated()

  const who = await caller(event, method === 'GET')
  const entries = await useAtelierEntries()
  const depthOf = (depth: number | undefined) => Math.min(depth ?? 0, limits().maxRelationDepth)
  const shape = async (entry: Entry, fields?: string[]) =>
    ({ ...entry, ...shadowed(entry), data: select(await present(who, definition.fields, name, entry.data), fields) })
  /** The entry's draft (what writes start from), or what the site serves. */
  const load = async (depth = 0, stage: 'draft' | 'published' = 'draft') => {
    const entry = await entries.get(name, id!, { depth, stage })
    if (!entry)
      throw apiError(404, `No entry "${id}" in "${name}"`)
    return entry
  }
  /** Saving with `publish` needs the publish permission too; the publish is audited. */
  const published = async (entry: Entry, publish: boolean | undefined) => {
    if (publish && definition.versioned)
      await audit(event, { action: 'entry.published', actorId: who.principal.id, target: { type: name, id: entry.id }, details: { version: entry.version } })
    return shape(entry)
  }

  try {
    if (!id && method === 'GET') {
      allow(who, 'read', name)
      const query = validated(ListParams, getQuery(event))
      const limit = Math.min(query.limit ?? 20, limits().maxPageSize)
      const page = await entries.list(name, {
        ...query,
        stage: stageFor(who, name, query.draft),
        limit,
        depth: depthOf(query.depth),
        ...who.policy.ownOnly(who.principal, 'read', name) ? { createdBy: who.principal.id } : {},
      })
      return { items: await Promise.all(page.items.map(e => shape(e, query.fields))), total: page.total, limit, next: page.next }
    }
    if (!id && method === 'POST') {
      allow(who, 'create', name)
      const { data, publish } = await readValid(event, Create)
      if (publish)
        allow(who, 'publish', name)
      assertWritable(who, name, data)
      await assertInversesWritable(who, entries, name, undefined, definition.fields, data)
      await countWrite(event, who)
      return published(await entries.save(name, { data, publish, authorId: who.principal.id }), publish)
    }
    if (id && !sub && method === 'GET') {
      const query = validated(v.pick(ListParams, ['depth', 'fields', 'draft']), getQuery(event))
      const entry = await load(depthOf(query.depth), stageFor(who, name, query.draft))
      allow(who, 'read', name, entry)
      return shape(entry, query.fields)
    }
    if (id && !sub && method === 'PATCH') {
      const stored = await load()
      allow(who, 'update', name, stored)
      const { version, data, publish } = await readValid(event, Update)
      if (publish)
        allow(who, 'publish', name, stored)
      assertWritable(who, name, data, stored.data)
      await assertInversesWritable(who, entries, name, id, definition.fields, data, stored.data)
      await countWrite(event, who)
      return published(await entries.save(name, { id, version, data: { ...stored.data, ...data }, publish, authorId: who.principal.id }), publish)
    }
    if (id && sub === 'publish' && method === 'POST') {
      const stored = await load()
      allow(who, 'publish', name, stored)
      const { version } = await readValid(event, AtVersion)
      await countWrite(event, who)
      return published(await entries.publish(name, id, { version, authorId: who.principal.id }), true)
    }
    if (id && sub === 'unpublish' && method === 'POST') {
      allow(who, 'publish', name, await load())
      await countWrite(event, who)
      await entries.unpublish(name, id, who.principal.id)
      await audit(event, { action: 'entry.unpublished', actorId: who.principal.id, target: { type: name, id } })
      return shape(await load())
    }
    if (id && !sub && method === 'DELETE') {
      const stored = await load()
      allow(who, 'delete', name, stored)
      await countWrite(event, who)
      await entries.delete(name, id, who.principal.id)
      await audit(event, { action: 'entry.deleted', actorId: who.principal.id, target: { type: name, id } })
      return { ok: true }
    }
    if (id && sub === 'schedule') {
      allow(who, 'read', name, await load())
      if (method !== 'GET')
        await countWrite(event, who)
      return await scheduleRequest(event, who, { type: name, id, singleton: false, versioned: !!definition.versioned }, version)
    }
    if (id && sub === 'revisions' && action === 'restore' && method === 'POST') {
      const stored = await load()
      allow(who, 'update', name, stored)
      const { version: current } = await readValid(event, AtVersion)
      const revision = /^\d+$/.test(version!) ? await entries.revision(name, id, Number(version)) : undefined
      if (!revision)
        throw apiError(404, `No version ${version} of entry "${id}"`)
      const data = restorable(who, name, revision.data, stored.data)
      await assertInversesWritable(who, entries, name, id, definition.fields, data, stored.data)
      await countWrite(event, who)
      return shape(await entries.save(name, { id, version: current, data, authorId: who.principal.id }))
    }
    if (id && sub === 'revisions' && !action && method === 'GET') {
      // history is part of editing: drafts are in it
      allow(who, 'update', name, await load())
      const history = await entries.revisions(name, id)
      if (version === undefined)
        return history.map(({ version, createdAt, authorId, published }) => ({ version, createdAt, authorId, published }))
      const revision = history.find(r => String(r.version) === version)
      if (!revision)
        throw apiError(404, `No version ${version} of entry "${id}"`)
      return { ...revision, data: await present(who, definition.fields, name, revision.data) }
    }
    throw apiError(405, `${method} isn't allowed here`)
  }
  catch (error) {
    throw toHttpError(error)
  }
})
