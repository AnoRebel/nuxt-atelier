// /sitemap.xml when the app has no sitemap module (@nuxtjs/sitemap reads /api/_atelier/sitemap as a source).
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { sitemapUrls, sitemapXml } from '../crawlers'

export default defineEventHandler(async (event) => {
  const origin = (useRuntimeConfig().public.atelier as { siteUrl?: string }).siteUrl || getRequestURL(event).origin
  return new Response(sitemapXml(await sitemapUrls(), origin), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } })
})
