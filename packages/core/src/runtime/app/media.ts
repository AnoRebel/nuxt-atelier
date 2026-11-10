// Responsive image markup for a media item: a srcset of its variants (see media-files.ts) with the
// rendered size's width and height, so the browser reserves the space before the image loads.
import type { MediaSummary } from '../shared/query'

export type ImageRatio = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | '21:9'
export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png'

export interface ImageOptions {
  /** Crop to this aspect ratio, around the item's focal point. */
  ratio?: ImageRatio
  format?: ImageFormat
  /** The `sizes` attribute: how wide the image shows at each viewport width. */
  sizes?: string
  /** Alt text: the item's for `locale` (or the shared one) by default. */
  alt?: string
  locale?: string
}

const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'])

/** The `<img>` attributes for a media item: `src`, `srcset`, `sizes`, `width`, `height`, `alt`. */
export function imageAttributes(media: MediaSummary, options: ImageOptions, widths: readonly number[]) {
  const [rw, rh] = options.ratio ? options.ratio.split(':').map(Number) as [number, number] : []
  const alt = options.alt ?? media.alt?.[options.locale ?? ''] ?? media.alt?.[''] ?? Object.values(media.alt ?? {})[0] ?? ''
  if (!RESIZABLE.has(media.mime) || !media.width || !media.height)
    return { src: media.url, alt, ...media.width && media.height ? { width: media.width, height: media.height } : {} }

  // the largest area of the requested ratio, as the server crops it
  const box = rw && rh
    ? (media.width / media.height > rw / rh ? { width: Math.round(media.height * rw / rh), height: media.height } : { width: media.width, height: Math.round(media.width * rh / rw) })
    : { width: media.width, height: media.height }
  // never enlarged: widths past the original's would be the same file
  const usable = widths.filter(w => w < box.width)
  const steps = [...usable, ...widths.find(w => w >= box.width) ? [widths.find(w => w >= box.width)!] : []]
  const url = (w: number) => `${media.url}?w=${w}${options.ratio ? `&ar=${options.ratio}` : ''}${options.format ? `&format=${options.format}` : ''}`
  return {
    src: url(steps.find(w => w >= Math.min(1280, box.width)) ?? steps.at(-1)!),
    srcset: steps.map(w => `${url(w)} ${Math.min(w, box.width)}w`).join(', '),
    sizes: options.sizes ?? '100vw',
    width: box.width,
    height: box.height,
    alt,
  }
}
