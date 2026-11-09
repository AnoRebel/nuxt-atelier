// The media library:
//   GET     /api/_atelier/media                   ?filter&sort&limit&offset&cursor (the query language on the media fields)
//   POST    /api/_atelier/media?filename=photo.jpg&folder=&private=true   the request body is the file
//   GET     /api/_atelier/media/<id>
//   PATCH   /api/_atelier/media/<id>              { title, alt, caption, credits, folder, tags, focal, private }
//   GET     /api/_atelier/media/<id>/usage        the entries using it, and in which field
//   DELETE  /api/_atelier/media/<id>              409 `referenced` with `usages` while it's used, unless ?force=true
// Signed-in users browse it; changing it takes the `media` capability. Files are served at /_atelier/media/<id>/<name>.
import type { Filter } from '../db/query'
import type { MediaItem } from '../media/library'
import * as v from 'valibot'
import { defineEventHandler, getQuery, getRequestHeader } from 'nuxt/server'
import { caller, countWrite, limits, segments } from '../content-access'
import { apiError, readValid, validated } from '../errors'
import { assertMigrated, toHttpError, useAtelierMedia, useAtelierServerConfig } from '../index'
import { UploadError } from '../media/library'

const count = (name: string) => v.optional(v.pipe(v.string(), v.regex(/^\d+$/, `${name}: expected a whole number`), v.transform(Number)))
const ListParams = v.object({
  filter: v.optional(v.pipe(v.string(), v.rawTransform(({ dataset, addIssue, NEVER }) => {
    try {
      return JSON.parse(dataset.value) as Filter
    }
    catch {
      addIssue({ message: 'filter: expected JSON, like {"tags":{"contains":"team"}}' })
      return NEVER
    }
  }))),
  sort: v.optional(v.pipe(v.string(), v.transform(s => s.split(',').map(x => x.trim()).filter(Boolean)))),
  limit: count('limit'),
  offset: count('offset'),
  cursor: v.optional(v.string()),
})
const UploadParams = v.object({
  filename: v.pipe(v.string('filename: name the file, e.g. ?filename=photo.jpg'), v.trim(), v.nonEmpty('filename: name the file'), v.maxLength(255)),
  folder: v.optional(v.pipe(v.string(), v.regex(/^(?:[\w-]+(?:\/[\w-]+)*)?$/, 'folder: letters, digits, "-" and "_", in levels separated by "/"'), v.maxLength(255))),
  private: v.optional(v.picklist(['true', 'false'], 'private: expected true or false')),
})
const text = (max: number) => v.optional(v.nullable(v.pipe(v.string(), v.maxLength(max))))
const Changes = v.strictObject({
  title: text(255),
  alt: v.optional(v.nullable(v.record(v.pipe(v.string(), v.regex(/^(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*)?$/i, 'alt: keys are locale codes, or "" for every locale')), v.pipe(v.string(), v.maxLength(1000))))),
  caption: text(2000),
  credits: text(500),
  folder: UploadParams.entries.folder,
  tags: v.optional(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(64))), v.maxLength(50), v.transform(tags => [...new Set(tags)]))),
  focal: v.optional(v.nullable(v.object({ x: v.pipe(v.number(), v.minValue(0), v.maxValue(1)), y: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) }))),
  private: v.optional(v.boolean('private: expected true or false')),
})

/** An item as the API shows it: with the URL its file is served at, without the storage key. */
const shown = (item: MediaItem) => ({ ...item, key: undefined, url: `/_atelier/media/${item.id}/${encodeURIComponent(item.filename)}` })

export default defineEventHandler(async (event) => {
  const [id, sub, ...rest] = segments(event, '/api/_atelier/media')
  const method = event.req.method
  if (rest.length || (sub !== undefined && sub !== 'usage'))
    throw apiError(404, 'Not found')
  if (method !== 'GET')
    await assertMigrated()
  const who = await caller(event)
  const library = await useAtelierMedia()
  const manage = () => {
    if (!who.policy.can(who.principal, 'manage', 'media'))
      throw apiError(403, 'Your role can\'t manage media')
  }

  try {
    if (!id && method === 'GET') {
      const query = validated(ListParams, getQuery(event))
      const page = await library.list({ ...query, limit: Math.min(query.limit ?? 50, limits().maxPageSize) })
      return { ...page, items: page.items.map(shown) }
    }
    if (!id && method === 'POST') {
      manage()
      const params = validated(UploadParams, getQuery(event))
      const max = (useAtelierServerConfig() as unknown as { limits: { maxUploadSize: number } }).limits.maxUploadSize
      if (Number(getRequestHeader(event, 'content-length') ?? 0) > max)
        throw apiError(413, `The file is larger than the ${Math.round(max / 1024 / 1024 * 10) / 10} MB allowed`)
      if (!event.req.body)
        throw apiError(400, 'Send the file as the request body')
      await countWrite(event, who)
      return shown(await library.upload({ body: event.req.body, filename: params.filename, folder: params.folder, private: params.private === 'true', createdBy: who.principal.id }))
    }
    const item = id ? await library.get(id) : undefined
    if (!item)
      throw apiError(404, `No media item "${id}"`)
    if (sub === 'usage' && method === 'GET')
      return library.usage(item.id)
    if (sub)
      throw apiError(405, `${method} isn't allowed here`)
    if (method === 'GET')
      return shown(item)
    if (method === 'PATCH') {
      manage()
      const changes = await readValid(event, Changes)
      await countWrite(event, who)
      return shown((await library.update(item.id, changes))!)
    }
    if (method === 'DELETE') {
      manage()
      // deleting a file in use leaves those entries without it: say where, and go ahead only when told to
      const usages = await library.usage(item.id)
      if (usages.length && getQuery(event).force !== 'true')
        throw apiError(409, `${item.filename} is used in ${usages.length} place${usages.length === 1 ? '' : 's'}; delete it anyway with ?force=true`, { usages }, 'referenced')
      await countWrite(event, who)
      await library.delete(item.id)
      return { ok: true }
    }
    throw apiError(405, `${method} isn't allowed here`)
  }
  catch (error) {
    if (error instanceof UploadError)
      throw apiError(error.statusCode, error.message, {}, error.statusCode === 413 ? 'too_large' : 'unsupported_type')
    throw toHttpError(error)
  }
})
