// The catch-all page's layout: the entry's type's (`route.layout`, else `default`), set on the route before it
// renders, so the app's own <NuxtLayout> renders it as for any page: with the props and attributes the app
// gives it, its transitions, and the app's own choice winning (an explicit `name`, or `setPageLayout` in a
// global middleware or plugin). The page reads its answer instead of asking again (useAtelierRouteEntry.ts).
import type { I18nAdapter } from '../../shared/i18n'
import type { AtelierRoute } from '../composables/useAtelierRouteEntry'
import { defineNuxtRouteMiddleware, useNuxtApp, useRequestFetch, useRuntimeConfig } from '#imports'
import { routeAnswers, routeKey, routeQuery } from '../composables/useAtelierRouteEntry'

export default defineNuxtRouteMiddleware(async (to) => {
  // the page's own `layout: false`, unless the app chose one before us
  if (to.meta.layout !== false)
    return
  const nuxtApp = useNuxtApp()
  const i18n = (useRuntimeConfig().public.atelier as { i18n?: I18nAdapter | null } | undefined)?.i18n
  const query = routeQuery(to, i18n)
  const key = routeKey(query)
  // hydrating: the server's answer is in the payload
  let route = nuxtApp.isHydrating ? nuxtApp.payload.data[key] as AtelierRoute | undefined : undefined
  if (!route) {
    try {
      route = await useRequestFetch()<AtelierRoute>('/api/_atelier/routes', { query })
      routeAnswers(nuxtApp).set(key, { data: route })
    }
    catch (error) { // not found and the like: the page throws its error
      routeAnswers(nuxtApp).set(key, { error })
    }
  }
  if (route)
    to.meta.layout = route.layout ?? 'default'
})
