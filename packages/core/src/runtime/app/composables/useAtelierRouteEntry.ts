import type { CollectionName, TypedEntry } from '../../shared/query'
import { useAsyncData, useRequestFetch, useRoute } from '#imports'

/** What `GET /api/_atelier/routes` answers for a path: the entry served there and how to render it. */
export interface AtelierRoute<N extends CollectionName = CollectionName> {
  path: string
  locale: string
  kind: 'collection' | 'singleton'
  name: string
  id: string
  component: string | null
  layout: string | null
  /** The entry's blocks fields, rendered in this order when there's no component. */
  blocks: string[]
  entry: TypedEntry<N>
}

/**
 * The entry served at the current URL, for the app's own layouts and components: the same request the
 * catch-all page makes (one fetch, shared by key), refetched when the route changes. `data` is null on
 * a URL no entry has, or one the visitor can't read; pass the collection's name for typed data.
 */
export function useAtelierRouteEntry<N extends CollectionName = CollectionName>() {
  const route = useRoute()
  const fetch = useRequestFetch() // forwards the visitor's cookies during SSR
  return useAsyncData(() => `atelier:route:${route.path}`, () =>
    fetch<AtelierRoute<N>>('/api/_atelier/routes', { query: { path: route.path } }))
}
