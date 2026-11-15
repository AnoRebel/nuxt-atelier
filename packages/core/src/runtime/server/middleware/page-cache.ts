// Rendered pages for visitors (`cache.pages` seconds, off by default), from the content cache: any content
// change clears them. Shareable only: an anonymous GET of a site page, with no edit, draft or preview in its
// query. Every other page render is private to who asked: `private, no-store`, and never kept (see
// plugins/page-cache.ts, which stores what this lets through).
import type { RequestEvent } from 'nuxt/server'
import { defineEventHandler, getRequestHeader, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { PUBLIC_ROLE } from '../../shared/policy'
import { cached } from '../cache'
import { inDemoSession } from '../demo/sessions'
import { caller } from '../content-access'
import { useAtelierSite } from '../index'

export interface CachedPage { status: number, type: string, body: string }
const PRIVATE_QUERY = /[?&](?:_atelier|_atelier_preview|draft|preview)=/

/** The page's cache key when its render may be shared; undefined when it's someone's own. */
async function shareable(event: RequestEvent, url: URL): Promise<string | undefined> {
  if (PRIVATE_QUERY.test(url.search) || inDemoSession())
    return undefined
  // cookies may be anyone's (analytics, consent): whoever sends them, signed in or not, decides
  if (getRequestHeader(event, 'cookie') || getRequestHeader(event, 'authorization')) {
    try {
      if ((await caller(event, true)).principal.role !== PUBLIC_ROLE)
        return undefined
    }
    catch {
      return undefined // an invalid token: no business with a shared page
    }
  }
  return `page:${useAtelierSite(event).name}|${url.pathname}${url.search}`
}

export default defineEventHandler(async (event) => {
  const method = event.req.method
  if (method !== 'GET' && method !== 'HEAD')
    return
  const url = getRequestURL(event)
  const admin = (useRuntimeConfig().public.atelier as { admin?: { base?: string } }).admin?.base ?? '/admin'
  if (/^\/(?:api|_)(?:\/|$)/.test(url.pathname) || url.pathname === admin || url.pathname.startsWith(`${admin}/`))
    return
  const key = await shareable(event, url)
  if (!key) {
    event.res.headers.set('cache-control', 'private, no-store')
    return
  }
  const seconds = (useRuntimeConfig().atelier as { cache?: { pages?: number } }).cache?.pages ?? 0
  if (seconds <= 0)
    return
  const hit = cached<CachedPage>(key, seconds * 1000)
  if (hit)
    return new Response(method === 'HEAD' ? null : hit.body, { status: hit.status, headers: { 'content-type': hit.type, 'x-atelier-cache': 'hit' } })
  event.context.atelierPageCache = key
})
