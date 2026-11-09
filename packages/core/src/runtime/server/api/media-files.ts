// Media files: GET /_atelier/media/<id>/<name>. A file's URL never changes (a new file gets a new id), so
// public ones are cached for a year; private ones only reach signed-in users, are never cached, and are a
// 404 for anyone else, as if they didn't exist.
import { defineEventHandler } from 'nuxt/server'
import { apiError } from '../errors'
import { segments } from '../content-access'
import { useAtelierAuth, useAtelierMedia } from '../index'

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD')
    throw apiError(405, `${event.req.method} isn't allowed here`)
  const [id, name, ...rest] = segments(event, '/_atelier/media')
  const notFound = () => apiError(404, 'Not found')
  const library = await useAtelierMedia()
  const item = id && name && !rest.length ? await library.get(id) : undefined
  if (!item || item.filename !== name)
    throw notFound()
  if (item.private && !await (await useAtelierAuth()).getUser(event))
    throw notFound()
  const file = await library.storage.get(item.key)
  if (!file)
    throw notFound()
  return new Response(event.req.method === 'HEAD' ? null : file.stream, {
    headers: {
      'content-type': item.mime,
      'content-length': String(file.size),
      'cache-control': item.private ? 'private, no-store' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.filename)}`,
    },
  })
})
