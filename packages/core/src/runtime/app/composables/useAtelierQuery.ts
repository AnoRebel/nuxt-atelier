import type { AsyncData, NuxtError } from 'nuxt/app'
import type { MaybeRefOrGetter } from 'vue'
import type { AtelierSingletons, SingletonEntry } from '../../shared/infer'
import type { CollectionName, CollectionQuery, TypedEntry, TypedEntryList } from '../../shared/query'
import { computed, toValue } from 'vue'
import { useFetch } from '#imports'
import { toSearchParams } from '../../shared/query'

// Return types spelled out: the package's declarations are built without the app's `#imports`, where
// `useFetch` would be untyped, and an inferred return would ship as `any`.
type Fetched<T> = AsyncData<T | undefined, NuxtError<unknown> | undefined>

/**
 * A page of a collection's entries from the content API, with SSR: `useFetch` under the hood, so it
 * renders on the server (with the visitor's session) and refetches when the query changes.
 */
export function useAtelierQuery<N extends CollectionName, Q extends CollectionQuery<N> = CollectionQuery<N>>(name: N, query?: MaybeRefOrGetter<Q>): Fetched<TypedEntryList<N, Q extends { depth: number } ? true : false>> {
  return useFetch<TypedEntryList<N, Q extends { depth: number } ? true : false>>(`/api/_atelier/collections/${name}`, {
    query: computed(() => toSearchParams(toValue(query))),
  })
}

/** One entry from the content API, with SSR. `depth` populates its relations; `locale` reads a localized one's translation. */
export function useAtelierEntry<N extends CollectionName, D extends number | undefined = undefined>(name: N, id: MaybeRefOrGetter<string>, options?: { depth?: D, locale?: MaybeRefOrGetter<string | undefined> }): Fetched<TypedEntry<N, D extends number ? true : false>> {
  return useFetch<TypedEntry<N, D extends number ? true : false>>(() => `/api/_atelier/collections/${name}/${encodeURIComponent(toValue(id))}`, {
    query: computed(() => ({
      ...options?.depth === undefined ? {} : { depth: String(options.depth) },
      ...toValue(options?.locale) === undefined ? {} : { locale: toValue(options?.locale) },
    })),
  })
}

/** A singleton as the content API answers it: the entry, with the singleton's data. */
export type Singleton<N extends keyof AtelierSingletons & string> = Omit<TypedEntry<CollectionName>, 'data' | 'path' | 'paths'> & { data: SingletonEntry<N> }

/**
 * A singleton from the content API (site settings, a footer), with SSR: one request per page wherever it's
 * used, shared by key. `depth` populates its relations.
 */
export function useAtelierSingleton<N extends keyof AtelierSingletons & string>(name: N, options?: { depth?: number }): Fetched<Singleton<N>> {
  return useFetch<Singleton<N>>(`/api/_atelier/singletons/${name}`, {
    key: `atelier:singleton:${name}:${options?.depth ?? 0}`,
    query: options?.depth === undefined ? {} : { depth: String(options.depth) },
  })
}
