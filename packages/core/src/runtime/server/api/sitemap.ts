// The sitemap's URLs as JSON, the source format of @nuxtjs/sitemap: [{ loc, lastmod, alternatives }].
//   GET /api/_atelier/sitemap
import { defineEventHandler } from 'nuxt/server'
import { sitemapUrls } from '../crawlers'

export default defineEventHandler(async () => Response.json(await sitemapUrls(), { headers: { 'cache-control': 'public, max-age=300' } }))
