// Image variants: a width from `media.widths`, an aspect ratio cropped around the focal point, a format,
// made with sharp (an optional dependency) on first request and kept in storage. Without sharp (Workers,
// edge runtimes) originals are served as they are.
import type { MediaItem } from './library'
import type { StorageDriver } from './storage'

export const ASPECTS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'] as const
export const FORMATS = ['webp', 'avif', 'jpeg', 'png'] as const
type VariantFormat = (typeof FORMATS)[number]

export interface Variant {
  width: number
  aspect?: (typeof ASPECTS)[number]
  format?: VariantFormat
}

/** Formats sharp can read: the images variants are made of. GIFs keep their animation as originals. */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'])
export const resizable = (item: MediaItem) => RESIZABLE.has(item.mime)

type Sharp = typeof import('sharp').default
let loaded: Promise<Sharp | undefined> | undefined
/** sharp, when it's installed and runs here. */
function loadSharp(): Promise<Sharp | undefined> {
  loaded ??= import('sharp').then(m => m.default).catch(() => undefined)
  return loaded
}

/**
 * The part of a `width`×`height` image with the aspect ratio `ratio` (width / height), as large as fits,
 * centred on the focal point (0–1 across and down) and kept inside the image.
 */
export function cropBox(width: number, height: number, ratio: number, focal: { x: number, y: number } = { x: 0.5, y: 0.5 }) {
  const box = width / height > ratio
    ? { width: Math.round(height * ratio), height }
    : { width, height: Math.round(width / ratio) }
  const clamp = (value: number, max: number) => Math.min(Math.max(Math.round(value), 0), max)
  return {
    left: clamp(focal.x * width - box.width / 2, width - box.width),
    top: clamp(focal.y * height - box.height / 2, height - box.height),
    ...box,
  }
}

const ratioOf = (aspect: string) => {
  const [w, h] = aspect.split(':').map(Number) as [number, number]
  return w / h
}

/** Where a variant is kept, next to its original. */
export const variantKey = (item: MediaItem, variant: Variant) =>
  `${item.key.split('/')[0]}/variants/w${variant.width}${variant.aspect ? `-${variant.aspect.replace(':', 'x')}` : ''}.${variant.format ?? item.mime.split('/')[1]}`

/** The MIME type a variant is served as. */
export const variantMime = (item: MediaItem, variant: Variant) => variant.format ? `image/${variant.format}` : item.mime

/**
 * A variant's stored file, made on first request: cropped around the focal point when `aspect` is set,
 * never enlarged past the original's width. Undefined without sharp, or when the original is gone.
 */
export async function variantFile(storage: StorageDriver, item: MediaItem, variant: Variant) {
  const sharp = await loadSharp()
  if (!sharp)
    return undefined
  const key = variantKey(item, variant)
  const cached = await storage.get(key)
  if (cached)
    return cached
  const original = await storage.get(item.key)
  if (!original)
    return undefined
  const input = new Uint8Array(await new Response(original.stream).arrayBuffer())
  let image = sharp(input, { failOn: 'error' }).rotate() // EXIF orientation applied, as browsers do
  const meta = await sharp(input).metadata()
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height!, meta.width!] : [meta.width!, meta.height!]
  if (variant.aspect)
    image = image.extract(cropBox(w, h, ratioOf(variant.aspect), item.focal ?? undefined))
  image = image.resize({ width: variant.width, withoutEnlargement: true })
  if (variant.format)
    image = image.toFormat(variant.format, { quality: variant.format === 'avif' ? 55 : 78 })
  const output = await image.toBuffer()
  await storage.put(key, new Response(output).body!, { contentType: variantMime(item, variant) })
  return { stream: new Response(output).body!, size: output.length }
}

/** An image's width and height (after its EXIF orientation), or undefined without sharp. */
export async function imageSize(storage: StorageDriver, item: MediaItem): Promise<{ width: number, height: number } | undefined> {
  const sharp = await loadSharp()
  if (!sharp || !resizable(item))
    return undefined
  const file = await storage.get(item.key)
  if (!file)
    return undefined
  const meta = await sharp(new Uint8Array(await new Response(file.stream).arrayBuffer())).metadata().catch(() => undefined)
  if (!meta?.width || !meta.height)
    return undefined
  return (meta.orientation ?? 1) >= 5 ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
}
