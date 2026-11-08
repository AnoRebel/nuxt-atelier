// Collection entries:
//   GET     /api/_atelier/collections/<name>                       list: ?filter=<JSON>&sort=-date,title&fields=title,date&limit&offset&cursor&depth
//   POST    /api/_atelier/collections/<name>                       { data }
//   GET     /api/_atelier/collections/<name>/<id>                  ?depth&fields
//   PATCH   /api/_atelier/collections/<name>/<id>                  { version, data }: merged into the stored data
//   DELETE  /api/_atelier/collections/<name>/<id>
//   GET     /api/_atelier/collections/<name>/<id>/revisions
//   GET     /api/_atelier/collections/<name>/<id>/revisions/<version>
import type { Filter } from '../db/query'
import type { Entry } from '../db/store'
import * as v from 'valibot'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { apiError, readValid, validated } from '../errors'
import { audit, toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { allow, assertInversesWritable, assertMigrated, assertWritable, caller, countWrite, limits, present, segments, select } from '../content-access'

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
})
const Create = v.object({ data: v.record(v.string(), v.unknown()) })
const Update = v.object({ version: v.number('version: expected the version you read'), data: v.record(v.string(), v.unknown()) })

export default defineEventHandler(async (event) => {
  const [name, id, sub, version, ...rest] = segments(event, PREFIX)
  const method = event.req.method
  const schema = await useAtelierSchema()
  const definition = name ? schema.collections[name] : undefined
  if (!name || !definition || rest.length || (sub !== undefined && sub !== 'revisions'))
    throw apiError(404, name && !definition ? `No collection "${name}"` : 'Not found')
  if (method !== 'GET')
    await assertMigrated()

  const who = await caller(event)
  const entries = await useAtelierEntries()
  const depthOf = (depth: number | undefined) => Math.min(depth ?? 0, limits().maxRelationDepth)
  const shape = async (entry: Entry, fields?: string[]) =>
    ({ ...entry, data: select(await present(who, definition.fields, name, entry.data), fields) })
  const load = async (depth = 0) => {
    const entry = await entries.get(name, id!, { depth })
    if (!entry)
      throw apiError(404, `No entry "${id}" in "${name}"`)
    return entry
  }

  try {
    if (!id && method === 'GET') {
      allow(who, 'read', name)
      const query = validated(ListParams, getQuery(event))
      const limit = Math.min(query.limit ?? 20, limits().maxPageSize)
      const page = await entries.list(name, {
        ...query,
        limit,
        depth: depthOf(query.depth),
        ...who.policy.ownOnly(who.principal, 'read', name) ? { createdBy: who.principal.id } : {},
      })
      return { items: await Promise.all(page.items.map(e => shape(e, query.fields))), total: page.total, limit, next: page.next }
    }
    if (!id && method === 'POST') {
      allow(who, 'create', name)
      const { data } = await readValid(event, Create)
      assertWritable(who, name, data)
      await assertInversesWritable(who, entries, name, undefined, definition.fields, data)
      await countWrite(event, who)
      return shape(await entries.save(name, { data, authorId: who.principal.id }))
    }
    if (id && !sub && method === 'GET') {
      const query = validated(v.pick(ListParams, ['depth', 'fields']), getQuery(event))
      const entry = await load(depthOf(query.depth))
      allow(who, 'read', name, entry)
      return shape(entry, query.fields)
    }
    if (id && !sub && method === 'PATCH') {
      const stored = await load()
      allow(who, 'update', name, stored)
      const { version, data } = await readValid(event, Update)
      assertWritable(who, name, data, stored.data)
      await assertInversesWritable(who, entries, name, id, definition.fields, data, stored.data)
      await countWrite(event, who)
      return shape(await entries.save(name, { id, version, data: { ...stored.data, ...data }, authorId: who.principal.id }))
    }
    if (id && !sub && method === 'DELETE') {
      const stored = await load()
      allow(who, 'delete', name, stored)
      await countWrite(event, who)
      await entries.delete(name, id)
      await audit(event, { action: 'entry.deleted', actorId: who.principal.id, target: { type: name, id } })
      return { ok: true }
    }
    if (id && sub && method === 'GET') {
      allow(who, 'read', name, await load())
      const history = await entries.revisions(name, id)
      if (version === undefined)
        return history.map(({ version, createdAt }) => ({ version, createdAt }))
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
