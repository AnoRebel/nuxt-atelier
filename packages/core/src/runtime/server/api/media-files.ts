// Media files:
//   GET  /_atelier/media/<id>/<name>   the file; images also ?w=640&ar=1:1&format=webp
// Image variants with `?w=640&ar=1:1&format=webp` (a width
// from `media.widths`, an aspect ratio cropped around the focal point, a format). A URL never changes what
// it serves (a new file gets a new id), so public files are cached for a year; private ones only reach
// signed-in users with access to the site, are never cached, and are a 404 for anyone else, as if they
// didn't exist. Uploads are the uploader's content, not the app's: they're sandboxed (an SVG's scripts don't
// run on the site's origin), and what a browser wouldn't display as media is downloaded, not opened.
import type { Variant } from '../media/images'
import { defineEventHandler, getQuery } from 'nuxt/server'
import { apiError } from '../errors'
import { segments } from '../content-access'
import { onSite, useAtelierAuth, useAtelierMedia, useAtelierServerConfig, useAtelierSite } from '../index'
import { ASPECTS, FORMATS, resizable, variantFile, variantMime } from '../media/images'

/** What a browser shows as media; anything else is downloaded. */
const INLINE = /^(?:image|video|audio)\/|^application\/pdf$/

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD')
    throw apiError(405, `${event.req.method} isn't allowed here`)
  const [id, name, ...rest] = segments(event, '/_atelier/media')
  const notFound = () => apiError(404, 'Not found')
  const library = await useAtelierMedia(useAtelierSite(event))
  const item = id && name && !rest.length ? await library.get(id) : undefined
  if (!item || item.filename !== name)
    throw notFound()
  if (item.private) {
    const user = await (await useAtelierAuth()).getUser(event)
    if (!user || !await onSite(event, user))
      throw notFound()
  }

  const query = getQuery(event)
  let file: { stream: ReadableStream<Uint8Array>, size: number } | undefined
  let mime = item.mime
  if (query.w !== undefined) {
    const widths = (useAtelierServerConfig() as unknown as { media: { widths: number[] | string } }).media.widths
    const allowed = typeof widths === 'string' ? JSON.parse(widths) as number[] : widths
    const variant: Variant = {
      width: Number(query.w),
      ...ASPECTS.includes(query.ar as never) ? { aspect: query.ar as Variant['aspect'] } : {},
      ...FORMATS.includes(query.format as never) ? { format: query.format as Variant['format'] } : {},
    }
    if (!allowed.includes(variant.width) || (query.ar !== undefined && !variant.aspect) || (query.format !== undefined && !variant.format))
      throw apiError(400, `Variants take w (one of ${allowed.join(', ')}), ar (${ASPECTS.join(', ')}) and format (${FORMATS.join(', ')})`)
    // without sharp (edge runtimes), or for a file that isn't a resizable image: the original
    file = resizable(item) ? await variantFile(library.storage, item, variant) : undefined
    if (file)
      mime = variantMime(item, variant)
  }
  file ??= await library.storage.get(item.key)
  if (!file)
    throw notFound()
  return new Response(event.req.method === 'HEAD' ? null : file.stream, {
    headers: {
      'content-type': mime,
      'content-length': String(file.size),
      'cache-control': item.private ? 'private, no-store' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // a PDF viewer doesn't open in a sandbox; it runs no script on the site's origin anyway
      ...mime === 'application/pdf' ? {} : { 'content-security-policy': 'sandbox' },
      'content-disposition': `${INLINE.test(mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(item.filename)}`,
    },
  })
})
