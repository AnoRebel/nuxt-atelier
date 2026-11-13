// An entry's search and social preview, worked out as the server renders the page (shared/seo.ts), and
// non-blocking checks on it: a missing description, a title or description too long, an image without
// alt text, another entry with the same title. Checks are codes; a kit words them.
import type { MaybeRefOrGetter } from 'vue'
import type { MediaSummary } from '#atelier/shared/query'
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from './debounced'
import { computed, toValue } from 'vue'
import { resolveSeo } from '#atelier/shared/seo'
import { useRuntimeConfig } from '#imports'
import { atelierFetch } from './useAtelierAdmin'

export type SeoCheck = 'description-missing' | 'description-short' | 'description-long' | 'title-long' | 'image-alt-missing' | 'title-duplicate'

/** Lengths past which search results usually cut the text. */
export const SEO_LIMITS = { title: 60, descriptionMin: 50, description: 160 }

export interface SeoInput {
  collection: string
  /** The entry's id, so it isn't its own duplicate. */
  id?: string
  data: Record<string, unknown>
  path?: string | null
  media?: Record<string, MediaSummary>
  locale?: string
}

export function useAtelierSeo(input: MaybeRefOrGetter<SeoInput>) {
  const config = useRuntimeConfig().public.atelier as { siteUrl?: string, seo?: { titleTemplate?: string } }
  const seo = computed(() => {
    const { data, media, path } = toValue(input)
    return resolveSeo({ data, media }, { path: path ?? '/', siteUrl: config.siteUrl })
  })
  const title = computed(() => (config.seo?.titleTemplate ?? '%s').replace('%s', seo.value.title))

  // another entry of the collection with the same title (as the page shows it)
  const ownTitle = refDebounced(computed(() => seo.value.title.trim()), 400)
  const titleKey = computed(() => {
    const data = toValue(input).data
    const seoTitle = (data.seo as { title?: unknown } | undefined)?.title
    return typeof seoTitle === 'string' && seoTitle.trim() ? 'seo.title' : ['title', 'name'].find(k => typeof data[k] === 'string')
  })
  const duplicates = useQuery({
    queryKey: ['atelier', 'collections', computed(() => toValue(input).collection), 'seo-title', titleKey, ownTitle],
    queryFn: () => atelierFetch<{ items: { id: string }[] }>(`/collections/${encodeURIComponent(toValue(input).collection)}`, {
      query: { draft: 'true', limit: 2, fields: titleKey.value!, filter: JSON.stringify({ [titleKey.value!]: { eq: ownTitle.value } }), ...toValue(input).locale ? { locale: toValue(input).locale } : {} },
    }),
    enabled: computed(() => !!ownTitle.value && !!titleKey.value && titleKey.value !== 'seo.title'),
  })

  const checks = computed<SeoCheck[]>(() => {
    const { data, media } = toValue(input)
    const found: SeoCheck[] = []
    const description = seo.value.description ?? ''
    if (!description)
      found.push('description-missing')
    else if (description.length < SEO_LIMITS.descriptionMin)
      found.push('description-short')
    else if (description.length > SEO_LIMITS.description)
      found.push('description-long')
    if (title.value.length > SEO_LIMITS.title)
      found.push('title-long')
    const imageId = [(data.seo as { image?: unknown } | undefined)?.image, data.image, data.cover].find(x => typeof x === 'string' && x) as string | undefined
    const image = imageId ? media?.[imageId] : undefined
    const locale = toValue(input).locale
    if (image && !(image.alt?.[locale ?? ''] || image.alt?.[''] || Object.values(image.alt ?? {}).some(Boolean)))
      found.push('image-alt-missing')
    if ((duplicates.data.value?.items ?? []).some(e => e.id !== toValue(input).id))
      found.push('title-duplicate')
    return found
  })

  return {
    /** As search results show the page: the title (with the site's template), the address and the description. */
    search: computed(() => ({ title: title.value, url: seo.value.canonical, description: seo.value.description ?? '' })),
    /** As a shared link shows it. */
    social: computed(() => ({ title: seo.value.title, description: seo.value.description ?? '', image: seo.value.image })),
    robots: computed(() => seo.value.robots),
    checks,
  }
}
