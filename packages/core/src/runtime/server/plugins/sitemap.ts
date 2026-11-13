// With @nuxtjs/sitemap: the CMS's published, indexable pages join its sources, read directly (no request).
import type { RequestEvent } from 'nuxt/server'
import { useServerHooks } from 'nuxt/server'
import { singleSite, useAtelierSite } from '../index'
import { sitemapUrls } from '../crawlers'

interface SourcesContext { sources: unknown[], event?: RequestEvent }

export default () => {
  ;(useServerHooks().hook as (name: 'sitemap:sources', fn: (ctx: SourcesContext) => Promise<void>) => void)('sitemap:sources', async (ctx) => {
    ctx.sources.push({ context: { name: 'nuxt-atelier', description: 'Published, indexable CMS pages' }, urls: await sitemapUrls(ctx.event ? useAtelierSite(ctx.event) : singleSite), sourceType: 'user' })
  })
}
