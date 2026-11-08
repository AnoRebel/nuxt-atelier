// The catch-all page (`/:path(.*)*`, ranked below every page of the app): renders the entry whose URL
// this is, with its type's component and layout, or the host's 404 error page.
import type { Component } from 'vue'
import { defineComponent, h, resolveDynamicComponent } from 'vue'
import { createError, useAsyncData, useRequestFetch, useRoute } from '#imports'
import { NuxtLayout } from '#components'
import AtelierBlocks from '../components/Blocks'

interface ResolvedPage {
  component: string | null
  layout: string | null
  blocks: string[]
  entry: { data: Record<string, unknown> }
}

export default defineComponent({
  name: 'AtelierPage',
  async setup() {
    const path = useRoute().path
    const fetch = useRequestFetch() // forwards the visitor's cookies during SSR
    const { data, error } = await useAsyncData(`atelier:route:${path}`, () =>
      fetch<ResolvedPage>('/api/_atelier/routes', { query: { path } }))
    const page = data.value
    if (error.value || !page) {
      // not found, or not readable by this visitor: the same 404, so it doesn't tell which
      const status = error.value?.statusCode ?? 404
      throw createError({ statusCode: status >= 500 ? status : 404, statusMessage: status >= 500 ? 'Server error' : 'Page not found', fatal: true })
    }
    return () => h(NuxtLayout, { name: page.layout ?? 'default' }, {
      default: () => page.component
        ? h(resolveDynamicComponent(page.component) as Component, { entry: page.entry })
        : page.blocks.map(key => h(AtelierBlocks, { key, blocks: page.entry.data[key] as never })),
    })
  },
})
