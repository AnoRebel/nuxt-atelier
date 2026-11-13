// With @nuxtjs/sitemap: the CMS's published, indexable pages join its sources, read directly (no request).
import { useServerHooks } from 'nuxt/server'
import { sitemapUrls } from '../crawlers'

interface SourcesContext { sources: unknown[] }

export default () => {
  ;(useServerHooks().hook as (name: 'sitemap:sources', fn: (ctx: SourcesContext) => Promise<void>) => void)('sitemap:sources', async (ctx) => {
    ctx.sources.push({ context: { name: 'nuxt-atelier', description: 'Published, indexable CMS pages' }, urls: await sitemapUrls(), sourceType: 'user' })
  })
}
