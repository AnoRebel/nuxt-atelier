// Shared preview links: a draft on its real URL for someone who can't sign in.
//   POST /api/_atelier/preview-links   { type, id?, hours? }: a link to the entry's draft, valid `hours` (default 24, at most 720)
// The link carries a token signed for this purpose (see secrets.ts) naming the entry and when it expires.
// Anyone with the link sees that one entry's draft until then; after, the page says it expired.
import * as v from 'valibot'
import { defineEventHandler } from 'nuxt/server'
import { apiError, readValid } from '../errors'
import { assertMigrated, toHttpError, useAtelierEntries, useAtelierSchema } from '../index'
import { allow, caller } from '../content-access'
import type { PreviewToken } from '../secrets'
import { PREVIEW_PURPOSE, signToken } from '../secrets'

const Body = v.object({
  type: v.pipe(v.string('type: expected a collection or singleton name'), v.maxLength(64)),
  id: v.optional(v.pipe(v.string(), v.maxLength(255))),
  hours: v.optional(v.pipe(v.number('hours: expected a number'), v.integer('hours: expected whole hours'), v.minValue(1, 'hours: at least 1'), v.maxValue(720, 'hours: at most 720 (30 days)'))),
})

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST')
    throw apiError(405, `${event.req.method} isn't allowed here`)
  await assertMigrated()
  const who = await caller(event)
  const { type, id, hours = 24 } = await readValid(event, Body)
  const schema = await useAtelierSchema()
  const singleton = type in schema.singletons
  const definition = schema.collections[type] ?? schema.singletons[type]
  if (!definition)
    throw apiError(404, `No collection or singleton "${type}"`)
  if (!definition.route)
    throw apiError(422, `"${type}" has no URLs to preview`, { errors: [{ path: 'type', message: 'not routable' }] })
  try {
    const entries = await useAtelierEntries()
    const draft = singleton ? await entries.getSingleton(type, { stage: 'draft' }) : id === undefined ? undefined : await entries.get(type, id, { stage: 'draft' })
    if (!draft)
      throw apiError(404, singleton ? `"${type}" has no draft` : `No entry "${id}" in "${type}"`)
    // whoever could preview it themselves may share it
    allow(who, 'update', type, singleton ? undefined : draft as { createdBy: string | null })
    if (!draft.path)
      throw apiError(422, 'This draft has no URL yet: fill in the fields its URL is made from', { errors: [{ path: 'id', message: 'no URL' }] })
    const expiresAt = Date.now() + hours * 3600_000
    const token = await signToken(PREVIEW_PURPOSE, { t: type, i: singleton ? type : id!, e: expiresAt } satisfies PreviewToken)
    return { url: `${draft.path}?_atelier_preview=${token}`, token, expiresAt: new Date(expiresAt).toISOString() }
  }
  catch (error) {
    throw toHttpError(error)
  }
})
