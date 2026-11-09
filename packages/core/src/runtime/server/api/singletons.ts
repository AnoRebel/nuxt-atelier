// Singletons:
//   GET    /api/_atelier/singletons/<name>                         ?depth&fields&draft; before it's saved (or published), the field defaults with version null
//   PATCH  /api/_atelier/singletons/<name>                         { version, data, publish? }: merged into the draft; version null for the first save
//   POST   /api/_atelier/singletons/<name>/publish                 { version }
//   POST   /api/_atelier/singletons/<name>/unpublish
//   GET    /api/_atelier/singletons/<name>/schedule                   the scheduled publish and unpublish
//   POST   /api/_atelier/singletons/<name>/schedule                   { action, at, version }: see schedule.ts
//   DELETE /api/_atelier/singletons/<name>/schedule/<action>
//   GET    /api/_atelier/singletons/<name>/revisions
//   GET    /api/_atelier/singletons/<name>/revisions/<version>
//   POST   /api/_atelier/singletons/<name>/revisions/<version>/restore   { version }: that version's data becomes the next draft
// Reads and writes as for collection entries.
import * as v from 'valibot'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { defaultsFactory } from '../../shared/fields'
import { apiError, readValid, validated } from '../errors'
import { audit, toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { scheduleRequest } from '../scheduling'
import { shadowed } from '../shadowing'
import { allow, assertMigrated, assertWritable, caller, countWrite, limits, present, restorable, segments, select, stageFor } from '../content-access'

const PREFIX = '/api/_atelier/singletons'
const Query = v.object({
  depth: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'depth: expected a whole number'), v.transform(Number))),
  fields: v.optional(v.pipe(v.string(), v.transform(text => text.split(',').map(s => s.trim()).filter(Boolean)))),
  draft: v.optional(v.string()),
})
const Update = v.object({
  version: v.nullable(v.number('version: expected the version you read, or null for the first save')),
  data: v.record(v.string(), v.unknown()),
  publish: v.optional(v.boolean('publish: expected true or false')),
})
const AtVersion = v.object({ version: v.number('version: expected the version you read') })
const SUBS = new Set(['revisions', 'publish', 'unpublish', 'schedule'])

export default defineEventHandler(async (event) => {
  const [name, sub, version, action, ...rest] = segments(event, PREFIX)
  const method = event.req.method
  const definition = name ? (await useAtelierSchema()).singletons[name] : undefined
  if (!name || !definition || rest.length || (sub !== undefined && !SUBS.has(sub)) || (sub !== 'revisions' && sub !== 'schedule' && version !== undefined) || (action !== undefined && (sub !== 'revisions' || action !== 'restore')))
    throw apiError(404, name && !definition ? `No singleton "${name}"` : 'Not found')
  if (method !== 'GET')
    await assertMigrated()

  const who = await caller(event, method === 'GET')
  const entries = await useAtelierEntries()
  const shape = async (saved: Awaited<ReturnType<typeof entries.saveSingleton>>, publish: boolean | undefined) => {
    if (publish && definition.versioned)
      await audit(event, { action: 'entry.published', actorId: who.principal.id, target: { type: name, id: name }, details: { version: saved.version } })
    return { ...saved, ...shadowed(saved), data: await present(who, definition.fields, name, saved.data) }
  }

  try {
    if (!sub && method === 'GET') {
      allow(who, 'read', name)
      const query = validated(Query, getQuery(event))
      const saved = await entries.getSingleton(name, { depth: Math.min(query.depth ?? 0, limits().maxRelationDepth), stage: stageFor(who, name, query.draft) })
      const entry = saved ?? { name, version: null, updatedAt: null, data: defaultsFactory(definition.fields)() }
      return { ...entry, ...saved && shadowed(saved), data: select(await present(who, definition.fields, name, entry.data), query.fields) }
    }
    if (!sub && method === 'PATCH') {
      allow(who, 'update', name)
      const { version, data, publish } = await readValid(event, Update)
      if (publish)
        allow(who, 'publish', name)
      const stored = (await entries.getSingleton(name, { stage: 'draft' }))?.data
      assertWritable(who, name, data, stored)
      await countWrite(event, who)
      return shape(await entries.saveSingleton(name, { version, data: { ...defaultsFactory(definition.fields)(), ...stored, ...data }, publish, authorId: who.principal.id }), publish)
    }
    if (sub === 'publish' && method === 'POST') {
      allow(who, 'publish', name)
      const { version } = await readValid(event, AtVersion)
      await countWrite(event, who)
      return shape(await entries.publishSingleton(name, { version, authorId: who.principal.id }), true)
    }
    if (sub === 'unpublish' && method === 'POST') {
      allow(who, 'publish', name)
      await countWrite(event, who)
      await entries.unpublishSingleton(name, who.principal.id)
      await audit(event, { action: 'entry.unpublished', actorId: who.principal.id, target: { type: name, id: name } })
      return { ok: true }
    }
    if (sub === 'schedule') {
      if (method !== 'GET')
        await countWrite(event, who)
      return await scheduleRequest(event, who, { type: name, id: name, singleton: true, versioned: !!definition.versioned }, version)
    }
    if (sub === 'revisions' && action === 'restore' && method === 'POST') {
      allow(who, 'update', name)
      const { version: current } = await readValid(event, AtVersion)
      const revision = /^\d+$/.test(version!) ? await entries.revision(name, name, Number(version)) : undefined
      if (!revision)
        throw apiError(404, `No version ${version} of "${name}"`)
      const stored = (await entries.getSingleton(name, { stage: 'draft' }))?.data
      await countWrite(event, who)
      return shape(await entries.saveSingleton(name, { version: current, data: restorable(who, name, revision.data, stored), authorId: who.principal.id }), false)
    }
    if (sub === 'revisions' && !action && method === 'GET') {
      allow(who, 'update', name) // history is part of editing: drafts are in it
      const history = await entries.revisions(name)
      if (version === undefined)
        return history.map(({ version, createdAt, authorId, published }) => ({ version, createdAt, authorId, published }))
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
