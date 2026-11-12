// A page's search and social metadata, from its entry: the `seo()` field's values where set, else the
// entry's own fields, else the page itself. Resolved during server rendering (pages/AtelierPage.ts), so
// crawlers that don't run JavaScript get it.

export interface ResolvedSeo {
  title: string
  description?: string
  /** An absolute URL when the site URL is known. */
  image?: string
  canonical: string
  /** `noindex`, `nofollow`, both, or undefined to leave robots alone. */
  robots?: string
}

const first = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && v.trim() !== '')?.trim()

/** `path` against the site URL (`NUXT_PUBLIC_ATELIER_SITE_URL`), when there is one. */
const absolute = (path: string, siteUrl: string) => /^https?:\/\//.test(path) || !siteUrl ? path : `${siteUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`

export function resolveSeo(entry: { data: Record<string, unknown>, media?: Record<string, { url: string }> }, page: { path: string, siteUrl?: string }): ResolvedSeo {
  const { data } = entry
  const seo = (data.seo && typeof data.seo === 'object' ? data.seo : {}) as Record<string, unknown>
  const siteUrl = page.siteUrl ?? ''
  const imageId = first(seo.image, data.image, data.cover)
  const image = imageId && entry.media?.[imageId]?.url
  const robots = [seo.noindex === true && 'noindex', seo.nofollow === true && 'nofollow'].filter(Boolean).join(', ')
  return {
    title: first(seo.title, data.title, data.name) ?? '',
    description: first(seo.description, data.description, data.excerpt, data.summary),
    ...image ? { image: absolute(image, siteUrl) } : {},
    canonical: absolute(first(seo.canonical) ?? page.path, siteUrl),
    ...robots ? { robots } : {},
  }
}
