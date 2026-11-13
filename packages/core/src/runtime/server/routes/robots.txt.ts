// /robots.txt when the app has no robots module (@nuxtjs/robots gets the same rules through its hook, see
// plugins/robots.ts) and no public/robots.txt (a static file is served first).
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { robotsTxt, useRobotsGroups } from '../crawlers'
import { useAtelierServerConfig, useAtelierSite } from '../index'

const trustProxy = () => (useAtelierServerConfig() as unknown as { auth: { trustProxy: boolean } }).auth.trustProxy

export default defineEventHandler(async (event) => {
  const site = useAtelierSite(event)
  // each site is served at its own hosts: its sitemap is on the one asked
  const siteUrl = (!site.scoped && (useRuntimeConfig().public.atelier as { siteUrl?: string }).siteUrl?.replace(/\/$/, '')) || getRequestURL(event, { xForwardedHost: trustProxy() }).origin
  const sitemap = (useRuntimeConfig().atelier as { sitemap?: string }).sitemap
  const text = robotsTxt(await useRobotsGroups(site), sitemap ? `${siteUrl}${sitemap}` : undefined)
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } })
})
