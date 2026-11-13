// The sitemap's URLs as JSON, the source format of @nuxtjs/sitemap: [{ loc, lastmod, alternatives }].
//   GET /api/_atelier/sitemap
import { defineEventHandler } from 'nuxt/server'
import { sitemapUrls } from '../crawlers'
import { useAtelierSite } from '../index'

export default defineEventHandler(async event => Response.json(await sitemapUrls(useAtelierSite(event)), { headers: { 'cache-control': 'public, max-age=300' } }))
