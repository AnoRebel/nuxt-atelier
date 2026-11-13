// Shared blocks (the `atelier-shared-blocks` collection, edited through the collections API):
//   GET   /api/_atelier/shared-blocks/<id>/usage     [{ type, id, field }]: where it's placed, drafts and live pages
//   POST  /api/_atelier/shared-blocks/<id>/release   { mode: 'detach' | 'remove' }: every reference becomes a copy
//         of its content, or goes; then it can be deleted (a delete while it's used answers 409 referenced)
// Releasing needs the delete permission on shared blocks, and update on every type that places it.
import { defineEventHandler } from 'nuxt/server'
import * as v from 'valibot'
import { SHARED_BLOCKS } from '../../shared/blocks'
import { allow, caller, countWrite, segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { assertMigrated, audit, useAtelierEntries, useAtelierSchema, useAtelierSite } from '../index'

const PREFIX = '/api/_atelier/shared-blocks/'
const Release = v.object({ mode: v.picklist(['detach', 'remove'], 'mode: expected "detach" or "remove"') })

export default defineEventHandler(async (event) => {
  const [id, action, ...rest] = segments(event, PREFIX)
  if (!(await useAtelierSchema()).collections[SHARED_BLOCKS] || !id || rest.length)
    throw apiError(404, 'Not found')
  const who = await caller(event)
  const entries = await useAtelierEntries(useAtelierSite(event))
  const shared = await entries.get(SHARED_BLOCKS, id, { stage: 'draft' })
  if (!shared)
    throw apiError(404, `No shared block "${id}"`)
  allow(who, 'read', SHARED_BLOCKS, shared)
  const usage = async () => (await entries.sharedUsage(id)).map(u => ({ type: u.collection, id: u.id, field: u.field }))

  if (action === 'usage' && event.req.method === 'GET')
    return usage()
  if (action === 'release' && event.req.method === 'POST') {
    await assertMigrated()
    const { mode } = await readValid(event, Release)
    allow(who, 'delete', SHARED_BLOCKS, shared)
    for (const type of new Set((await usage()).map(u => u.type)))
      allow(who, 'update', type)
    await countWrite(event, who)
    const changed = await entries.releaseShared(id, mode)
    await audit(event, { action: 'shared.released', actorId: who.principal.id, target: { type: SHARED_BLOCKS, id }, details: { mode, entries: changed.map(c => ({ type: c.collection, id: c.id })) } })
    return { changed: changed.map(c => ({ type: c.collection, id: c.id })) }
  }
  throw apiError(404, 'Not found')
})
