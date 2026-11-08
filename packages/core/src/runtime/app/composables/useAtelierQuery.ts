import type { MaybeRefOrGetter } from 'vue'
import type { CollectionName, CollectionQuery, TypedEntry, TypedEntryList } from '../../shared/query'
import { computed, toValue } from 'vue'
import { useFetch } from '#imports'
import { toSearchParams } from '../../shared/query'

/**
 * A page of a collection's entries from the content API, with SSR: `useFetch` under the hood, so it
 * renders on the server (with the visitor's session) and refetches when the query changes.
 */
export function useAtelierQuery<N extends CollectionName, Q extends CollectionQuery<N> = CollectionQuery<N>>(name: N, query?: MaybeRefOrGetter<Q>) {
  return useFetch<TypedEntryList<N, Q extends { depth: number } ? true : false>>(`/api/_atelier/collections/${name}`, {
    query: computed(() => toSearchParams(toValue(query))),
  })
}

/** One entry from the content API, with SSR. `depth` populates its relations. */
export function useAtelierEntry<N extends CollectionName, D extends number | undefined = undefined>(name: N, id: MaybeRefOrGetter<string>, options?: { depth?: D }) {
  return useFetch<TypedEntry<N, D extends number ? true : false>>(() => `/api/_atelier/collections/${name}/${encodeURIComponent(toValue(id))}`, {
    query: options?.depth === undefined ? {} : { depth: String(options.depth) },
  })
}
