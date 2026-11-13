// /sitemap.xml when the app has no sitemap module (@nuxtjs/sitemap reads /api/_atelier/sitemap as a source).
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { sitemapUrls, sitemapXml } from '../crawlers'
import { useAtelierServerConfig, useAtelierSite } from '../index'

const trustProxy = () => (useAtelierServerConfig() as unknown as { auth: { trustProxy: boolean } }).auth.trustProxy

export default defineEventHandler(async (event) => {
  const site = useAtelierSite(event)
  const origin = (!site.scoped && (useRuntimeConfig().public.atelier as { siteUrl?: string }).siteUrl) || getRequestURL(event, { xForwardedHost: trustProxy() }).origin
  return new Response(sitemapXml(await sitemapUrls(site), origin), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } })
})
