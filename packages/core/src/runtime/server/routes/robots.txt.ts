// /robots.txt when the app has no robots module (@nuxtjs/robots gets the same rules through its hook, see
// plugins/robots.ts) and no public/robots.txt (a static file is served first).
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { robotsTxt, useRobotsGroups } from '../crawlers'

export default defineEventHandler(async (event) => {
  const siteUrl = (useRuntimeConfig().public.atelier as { siteUrl?: string }).siteUrl?.replace(/\/$/, '') || getRequestURL(event).origin
  const sitemap = (useRuntimeConfig().atelier as { sitemap?: string }).sitemap
  const text = robotsTxt(await useRobotsGroups(), sitemap ? `${siteUrl}${sitemap}` : undefined)
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } })
})
