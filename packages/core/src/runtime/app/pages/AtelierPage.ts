// The catch-all page (`/:path(.*)*`, ranked below every page of the app): renders the entry whose URL
// this is, with its type's component and layout, or the host's 404 error page.
import type { Component } from 'vue'
import { computed, defineComponent, h, resolveDynamicComponent } from 'vue'
import { createError, useHead, useRoute, useRuntimeConfig, useSeoMeta } from '#imports'
import { NuxtLayout } from '#components'
import AtelierBlocks from '../components/Blocks'
import type { I18nAdapter } from '../../shared/i18n'
import { localePath } from '../../shared/i18n'
import { resolveSeo } from '../../shared/seo'
import { useAtelierRouteEntry } from '../composables/useAtelierRouteEntry'

export default defineComponent({
  name: 'AtelierPage',
  async setup() {
    const route = useAtelierRouteEntry()
    // search and social metadata, rendered on the server (shared/seo.ts). Registered before the await: after
    // it, outside an SFC, there's no Nuxt context to register them with.
    const config = useRuntimeConfig().public.atelier as { siteUrl?: string, seo?: { titleTemplate?: string, jsonLd?: Record<string, unknown> | null }, i18n?: I18nAdapter | null } | undefined
    const site = (path: string) => config?.siteUrl ? `${config.siteUrl.replace(/\/$/, '')}${path}` : path
    const path = useRoute().path
    const seo = computed(() => route.data.value ? resolveSeo({ data: route.data.value.entry.data as Record<string, unknown>, media: route.data.value.media }, { path, siteUrl: config?.siteUrl }) : undefined)
    const template = config?.seo?.titleTemplate ?? '%s'
    useHead(() => ({
      titleTemplate: (title?: string) => title ? template.replace('%s', title) : null,
      link: [
        ...seo.value ? [{ rel: 'canonical', href: seo.value.canonical }] : [],
        // each translation, as the site's i18n module prefixes it
        ...Object.entries(route.data.value?.alternates ?? {}).map(([locale, path]) => ({ rel: 'alternate', hreflang: locale, href: site(config?.i18n ? localePath(config.i18n, path, locale) : path) })),
      ],
      // JSON-LD: the site's, then the type's. `<` escaped, so no value can close the script element
      script: [config?.seo?.jsonLd, ...[route.data.value?.jsonLd ?? []].flat()].filter(Boolean).map(data => ({
        type: 'application/ld+json',
        innerHTML: JSON.stringify({ '@context': 'https://schema.org', ...data }).replaceAll('<', '\\u003c'),
      })),
    }))
    useSeoMeta({
      title: () => seo.value?.title,
      description: () => seo.value?.description,
      ogTitle: () => seo.value?.title,
      ogDescription: () => seo.value?.description,
      ogImage: () => seo.value?.image,
      ogUrl: () => seo.value?.canonical,
      ogType: 'website',
      twitterCard: () => seo.value?.image ? 'summary_large_image' : 'summary',
      robots: () => seo.value?.robots,
    })
    const { data, error } = await route
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
