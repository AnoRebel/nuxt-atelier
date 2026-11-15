// Redirects, for roles with the `redirects` capability:
//   GET     /api/_atelier/redirects  every redirect, oldest first
//   POST    /api/_atelier/redirects  { source, target, status? }   status 301 (default), 302, 307 or 308
//   PATCH   /api/_atelier/redirects/<id>  { source, target, status? }   an edited automatic redirect becomes a manual one
//   DELETE  /api/_atelier/redirects/<id>
// Loops, sources in use and sources that are an entry's URL are refused with 422.
import * as v from 'valibot'
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { assertMigrated, audit, requireUser, toHttpError, useAtelierEntries, useAtelierSite } from '../index'
import { apiError, readValid } from '../errors'

const PREFIX = '/api/_atelier/redirects'
const Body = v.object({
  source: v.pipe(v.string('source: expected a path'), v.maxLength(255)),
  target: v.pipe(v.string('target: expected a path or URL'), v.maxLength(2048)),
  status: v.optional(v.number()),
})

export default defineEventHandler(async (event) => {
  const actor = await requireUser(event, 'redirects')
  const id = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, ''))
  const method = event.req.method
  const redirects = (await useAtelierEntries(useAtelierSite(event))).redirects
  try {
    if (!id && method === 'GET')
      return await redirects.list()
    await assertMigrated()
    if (!id && method === 'POST') {
      const saved = await redirects.save(await readValid(event, Body))
      await audit(event, { action: 'redirect.created', actorId: actor.id, target: { type: 'redirect', id: saved.id }, details: { source: saved.source, target: saved.target, status: saved.status } })
      return saved
    }
    if (id && method === 'PATCH') {
      const saved = await redirects.save({ ...await readValid(event, Body), id })
      await audit(event, { action: 'redirect.updated', actorId: actor.id, target: { type: 'redirect', id }, details: { source: saved.source, target: saved.target, status: saved.status } })
      return saved
    }
    if (id && method === 'DELETE') {
      await redirects.delete(id)
      await audit(event, { action: 'redirect.deleted', actorId: actor.id, target: { type: 'redirect', id } })
      return { ok: true }
    }
  }
  catch (error) {
    throw toHttpError(error)
  }
  throw apiError(405, `${method} isn't allowed here`)
})
