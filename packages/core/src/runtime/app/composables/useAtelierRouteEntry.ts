import type { AsyncData, NuxtApp, NuxtError } from 'nuxt/app'
import type { CollectionName, MediaSummary, TypedEntry } from '../../shared/query'
import type { I18nAdapter } from '../../shared/i18n'
import { useAsyncData, useNuxtApp, useRequestFetch, useRoute, useRuntimeConfig } from '#imports'
import { splitLocalePath } from '../../shared/i18n'

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
  /** The media items the entry uses, by id. */
  media?: Record<string, MediaSummary>
  /** A localized entry published in more than one locale: its path in each (without a locale prefix). */
  alternates?: Record<string, string>
  /** Structured data from the type's `route.jsonLd`. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

/**
 * The entry served at the current URL, for the app's own layouts and components: the same request the
 * catch-all page makes (one fetch, shared by key), refetched when the route changes. `data` is null on
 * a URL no entry has, or one the visitor can't read; pass the collection's name for typed data.
 *
 * Drafts show with `?_atelier=preview` for editors who can edit the type, and with a shared preview
 * link's `?_atelier_preview=<token>` for anyone, until it expires.
 */
// the return type spelled out: the package's declarations are built without the app's `#imports`
export function useAtelierRouteEntry<N extends CollectionName = CollectionName>(): AsyncData<AtelierRoute<N> | undefined, NuxtError<unknown> | undefined> {
  const route = useRoute()
  const nuxtApp = useNuxtApp()
  const fetch = useRequestFetch() // forwards the visitor's cookies during SSR
  const i18n = (useRuntimeConfig().public.atelier as { i18n?: I18nAdapter | null } | undefined)?.i18n
  return useAsyncData(() => routeKey(routeQuery(route, i18n)), () => {
    const query = routeQuery(route, i18n)
    // the layout middleware asked and was refused (not found, gone): the same answer, not a second request
    const answers = routeAnswers(nuxtApp)
    const answered = answers.get(routeKey(query))
    if (answered && 'error' in answered) {
      answers.delete(routeKey(query)) // once: a refresh asks again
      return Promise.reject(answered.error)
    }
    return fetch<AtelierRoute<N>>('/api/_atelier/routes', { query })
  }, {
    // the layout middleware's answer for this navigation, by the page and a layout reading the entry alike;
    // hydrating, the server's. A refresh asks again.
    getCachedData: (key, app, context) => {
      if (app.isHydrating)
        return app.payload.data[key]
      if (context.cause === 'refresh:manual' || context.cause === 'refresh:hook')
        return undefined
      const answered = routeAnswers(app).get(key)
      return answered && 'data' in answered ? answered.data : app.static.data[key]
    },
  }) as AsyncData<AtelierRoute<N> | undefined, NuxtError<unknown> | undefined>
}

/** The routes endpoint's query for a route: its path (an i18n module's locale prefix split off), and draft or preview. */
export function routeQuery(route: { path: string, query: Record<string, unknown> }, i18n: I18nAdapter | null | undefined): Record<string, string> {
  const token = route.query._atelier_preview
  return {
    // with an i18n module, `/de/produkte/stuhl` is the German entry at `/produkte/stuhl`
    ...i18n ? splitLocalePath(i18n, route.path) : { path: route.path },
    ...route.query._atelier === 'preview' || route.query._atelier === 'edit' ? { draft: 'true' } : {},
    ...typeof token === 'string' ? { preview: token } : {},
  }
}

export const routeKey = (query: Record<string, string>): string => `atelier:route:${JSON.stringify(query)}`

/** The layout middleware's answers from the routes endpoint, by key, for the page's fetch. Per app (per request on the server). */
export function routeAnswers(nuxtApp: NuxtApp): Map<string, { data: AtelierRoute } | { error: unknown }> {
  const app = nuxtApp as NuxtApp & { _atelierRoutes?: Map<string, { data: AtelierRoute } | { error: unknown }> }
  return app._atelierRoutes ??= new Map()
}
