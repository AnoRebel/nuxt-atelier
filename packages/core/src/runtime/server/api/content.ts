// Content an adapter serves (content-adapters.ts), for signed-in users, as the adapter's permissions allow:
//   GET   /api/_atelier/content/<kind>/<name>[/<id>]   { ref, version, data, can }: the state to edit (no id: a new entry's)
//   POST  /api/_atelier/content/collection/<name>      { data }: saves a new entry
//   PUT   /api/_atelier/content/<kind>/<name>[/<id>]   { version, data }: saves; 409 when someone saved in between
//   GET   /api/_atelier/content/<kind>/<name>[/<id>]/revisions[/<version>]   its history, with an adapter that keeps one
// <kind>: collection or singleton. The adapter gets the signed-in user as its context.
import type { ContentRef } from '../../shared/adapter'
import { defineEventHandler, isNuxtError } from 'nuxt/server'
import * as v from 'valibot'
import { adapterFor } from '../content-adapters'
import { segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { requireUser } from '../index'

const Save = v.object({ version: v.nullable(v.number()), data: v.record(v.string(), v.unknown()) })
const Create = v.object({ data: v.record(v.string(), v.unknown()) })

/** An adapter's error, as the API answers it: its status (or 500) and message. */
function answer(error: unknown): never {
  if (isNuxtError(error))
    throw error
  const status = (error as { statusCode?: unknown }).statusCode
  if (typeof status === 'number' && status >= 400 && status < 500)
    throw apiError(status, (error as Error).message, (error as { data?: Record<string, unknown> }).data ?? {})
  throw error
}

export default defineEventHandler(async (event) => {
  const parts = segments(event, '/api/_atelier/content')
  const [kind, name = '', ...rest] = parts
  const served = adapterFor(name)
  if ((kind !== 'collection' && kind !== 'singleton') || !served || served.kind !== kind)
    throw apiError(404, `No content "${name}" served by an adapter`)
  // a collection's path has its id (none: a new entry); a singleton's doesn't
  const id = kind === 'collection' && rest[0] !== 'revisions' ? rest.shift() : undefined
  const [sub, version, ...extra] = rest
  if (extra.length || (sub !== undefined && sub !== 'revisions'))
    throw apiError(404, 'Not found')
  const ref: ContentRef = kind === 'collection' ? { kind, name, ...id ? { id } : {} } : { kind, name }
  const user = await requireUser(event)
  const context = { user }
  const { adapter } = served
  const method = event.req.method

  try {
    const can = await adapter.permissions(ref, context)
    if (!can.read)
      throw apiError(403, `You can't read "${name}"`)
    if (sub === 'revisions') {
      if (method !== 'GET')
        throw apiError(405, `${method} isn't allowed here`)
      if (!adapter.revisions)
        throw apiError(404, `The "${adapter.name}" content adapter keeps no history`, {}, 'unsupported')
      return version === undefined ? await adapter.revisions.list(ref) : await adapter.revisions.load(ref, Number(version))
    }
    if (method === 'GET')
      return { ...await adapter.loadEditState(ref, context), can }
    if (!can.update)
      throw apiError(403, `You can't edit "${name}"`)
    if (method === 'POST' && kind === 'collection' && !id) {
      const { data } = await readValid(event, Create)
      return await adapter.save({ ref, version: null, data }, context)
    }
    if (method === 'PUT' && (kind === 'singleton' || id)) {
      const { version: at, data } = await readValid(event, Save)
      return await adapter.save({ ref, version: at, data }, context)
    }
    throw apiError(405, `${method} isn't allowed here`)
  }
  catch (error) {
    answer(error)
  }
})
