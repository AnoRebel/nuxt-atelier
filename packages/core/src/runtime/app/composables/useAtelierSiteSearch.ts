import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import { useFetch } from '#imports'

export interface SiteSearchResult {
  type: string
  id: string
  locale?: string
  title: string
  /** The page's address, for routable types. */
  path: string | null
  /** Around the match: HTML with the matched words in `<mark>`, everything else escaped. Safe for v-html. */
  excerpt: string
  score: number
}

/**
 * Site search over published content, with SSR (`useFetch`), refetching as the query changes. Nothing is
 * fetched for an empty query.
 */
export function useAtelierSiteSearch(query: MaybeRefOrGetter<string>, options: { types?: MaybeRefOrGetter<string[] | undefined>, locale?: MaybeRefOrGetter<string | undefined>, limit?: MaybeRefOrGetter<number | undefined>, offset?: MaybeRefOrGetter<number | undefined> } = {}) {
  const params = computed(() => ({
    q: toValue(query).trim(),
    ...toValue(options.types)?.length ? { types: toValue(options.types)!.join(',') } : {},
    ...toValue(options.locale) ? { locale: toValue(options.locale) } : {},
    ...toValue(options.limit) === undefined ? {} : { limit: String(toValue(options.limit)) },
    ...toValue(options.offset) === undefined ? {} : { offset: String(toValue(options.offset)) },
  }))
  return useFetch<{ items: SiteSearchResult[], total: number, limit: number, offset: number }>('/api/_atelier/search', {
    query: params,
    immediate: !!params.value.q,
    watch: [params],
    default: () => ({ items: [], total: 0, limit: 10, offset: 0 }),
  })
}
