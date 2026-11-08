// Singletons:
//   GET    /api/_atelier/singletons/<name>                         ?depth&fields; before its first save, the field defaults with version null
//   PATCH  /api/_atelier/singletons/<name>                         { version, data }: merged into the stored data; version null for the first save
//   GET    /api/_atelier/singletons/<name>/revisions
//   GET    /api/_atelier/singletons/<name>/revisions/<version>
import * as v from 'valibot'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { defaultsFactory } from '../../shared/fields'
import { apiError, readValid, validated } from '../errors'
import { toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { allow, assertMigrated, assertWritable, caller, countWrite, limits, present, segments, select } from '../content-access'

const PREFIX = '/api/_atelier/singletons'
const Query = v.object({
  depth: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'depth: expected a whole number'), v.transform(Number))),
  fields: v.optional(v.pipe(v.string(), v.transform(text => text.split(',').map(s => s.trim()).filter(Boolean)))),
})
const Update = v.object({ version: v.nullable(v.number('version: expected the version you read, or null for the first save')), data: v.record(v.string(), v.unknown()) })

export default defineEventHandler(async (event) => {
  const [name, sub, version, ...rest] = segments(event, PREFIX)
  const method = event.req.method
  const definition = name ? (await useAtelierSchema()).singletons[name] : undefined
  if (!name || !definition || rest.length || (sub !== undefined && sub !== 'revisions'))
    throw apiError(404, name && !definition ? `No singleton "${name}"` : 'Not found')
  if (method !== 'GET')
    await assertMigrated()

  const who = await caller(event)
  const entries = await useAtelierEntries()

  try {
    if (!sub && method === 'GET') {
      allow(who, 'read', name)
      const query = validated(Query, getQuery(event))
      const saved = await entries.getSingleton(name, { depth: Math.min(query.depth ?? 0, limits().maxRelationDepth) })
      const entry = saved ?? { name, version: null, updatedAt: null, data: defaultsFactory(definition.fields)() }
      return { ...entry, data: select(await present(who, definition.fields, name, entry.data), query.fields) }
    }
    if (!sub && method === 'PATCH') {
      allow(who, 'update', name)
      const { version, data } = await readValid(event, Update)
      const stored = (await entries.getSingleton(name))?.data
      assertWritable(who, name, data, stored)
      await countWrite(event, who)
      const saved = await entries.saveSingleton(name, { version, data: { ...defaultsFactory(definition.fields)(), ...stored, ...data }, authorId: who.principal.id })
      return { ...saved, data: await present(who, definition.fields, name, saved.data) }
    }
    if (sub && method === 'GET') {
      allow(who, 'read', name)
      const history = await entries.revisions(name)
      if (version === undefined)
        return history.map(({ version, createdAt }) => ({ version, createdAt }))
      const revision = history.find(r => String(r.version) === version)
      if (!revision)
        throw apiError(404, `No version ${version} of "${name}"`)
      return { ...revision, data: await present(who, definition.fields, name, revision.data) }
    }
    throw apiError(405, `${method} isn't allowed here`)
  }
  catch (error) {
    throw toHttpError(error)
  }
})
