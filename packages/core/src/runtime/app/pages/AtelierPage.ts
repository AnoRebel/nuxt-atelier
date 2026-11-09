// The catch-all page (`/:path(.*)*`, ranked below every page of the app): renders the entry whose URL
// this is, with its type's component and layout, or the host's 404 error page.
import type { Component } from 'vue'
import { defineComponent, h, resolveDynamicComponent } from 'vue'
import { createError } from '#imports'
import { NuxtLayout } from '#components'
import AtelierBlocks from '../components/Blocks'
import { useAtelierRouteEntry } from '../composables/useAtelierRouteEntry'

export default defineComponent({
  name: 'AtelierPage',
  async setup() {
    const { data, error } = await useAtelierRouteEntry()
    const page = data.value
    if (error.value || !page) {
      // not found, or not readable by this visitor: the same 404, so it doesn't tell which.
      // An expired preview link says so (410), without the draft.
      const status = error.value?.statusCode ?? 404
      if (status === 410)
        throw createError({ statusCode: 410, statusMessage: 'Preview link expired', message: 'This preview link has expired. Ask for a new one.', fatal: true })
      throw createError({ statusCode: status >= 500 ? status : 404, statusMessage: status >= 500 ? 'Server error' : 'Page not found', fatal: true })
    }
    return () => h(NuxtLayout, { name: page.layout ?? 'default' }, {
      default: () => page.component
        ? h(resolveDynamicComponent(page.component) as Component, { entry: page.entry })
        : page.blocks.map(key => h(AtelierBlocks, { key, blocks: (page.entry.data as Record<string, unknown>)[key] as never })),
    })
  },
})
