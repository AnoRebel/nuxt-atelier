import type { MaybeRefOrGetter } from 'vue'
import type { AtelierSingletons, SingletonEntry } from '../../shared/infer'
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

/** One entry from the content API, with SSR. `depth` populates its relations; `locale` reads a localized one's translation. */
export function useAtelierEntry<N extends CollectionName, D extends number | undefined = undefined>(name: N, id: MaybeRefOrGetter<string>, options?: { depth?: D, locale?: MaybeRefOrGetter<string | undefined> }) {
  return useFetch<TypedEntry<N, D extends number ? true : false>>(() => `/api/_atelier/collections/${name}/${encodeURIComponent(toValue(id))}`, {
    query: computed(() => ({
      ...options?.depth === undefined ? {} : { depth: String(options.depth) },
      ...toValue(options?.locale) === undefined ? {} : { locale: toValue(options?.locale) },
    })),
  })
}

/**
 * A singleton from the content API (site settings, a footer), with SSR: one request per page wherever it's
 * used, shared by key. `depth` populates its relations.
 */
export function useAtelierSingleton<N extends keyof AtelierSingletons & string>(name: N, options?: { depth?: number }) {
  return useFetch<Omit<TypedEntry<CollectionName>, 'data' | 'path' | 'paths'> & { data: SingletonEntry<N> }>(`/api/_atelier/singletons/${name}`, {
    key: `atelier:singleton:${name}:${options?.depth ?? 0}`,
    query: options?.depth === undefined ? {} : { depth: String(options.depth) },
  })
}
