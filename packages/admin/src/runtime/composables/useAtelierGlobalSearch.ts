// The admin's global search: entries, singletons, media and users the signed-in user may see, by title
// (GET /api/_atelier/search/admin), as they type.
import type { MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { refDebounced } from './debounced'
import { atelierFetch } from './useAtelierAdmin'

export interface GlobalSearchResult {
  kind: 'entry' | 'singleton' | 'media' | 'user'
  type?: string
  id: string
  title: string
  detail?: string
}

export function useAtelierGlobalSearch(query: MaybeRefOrGetter<string>) {
  const text = refDebounced(computed(() => toValue(query).trim()), 200)
  const search = useQuery({
    queryKey: ['atelier', 'global-search', text],
    queryFn: () => atelierFetch<{ results: GlobalSearchResult[] }>('/search/admin', { query: { q: text.value } }),
    enabled: computed(() => !!text.value),
    placeholderData: keepPreviousData,
  })
  return {
    results: computed(() => text.value ? search.data.value?.results ?? [] : []),
    loading: computed(() => !!text.value && search.isFetching.value),
  }
}
