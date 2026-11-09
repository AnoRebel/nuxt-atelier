// Redirects, before anything renders: GET and HEAD requests for site paths (not /api or /_…) whose
// path matches a redirect get its status and Location, with the request's query string kept.
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { useAtelierEntries } from '../index'
import { findRedirect } from '../redirects'
import { canonicalPath } from '../routes'

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD')
    return
  const url = getRequestURL(event)
  if (/^\/(?:api|_)(?:\/|$)/.test(url.pathname))
    return
  const path = canonicalPath(url.pathname)
  if (!path)
    return
  let list
  try {
    list = await (await useAtelierEntries()).redirects.cached()
  }
  catch {
    return // no database yet, or migrations pending: serve the page, never fail it over a redirect
  }
  const hit = findRedirect(list, path)
  if (!hit)
    return
  const location = url.search && !hit.location.includes('?') ? `${hit.location}${url.search}` : hit.location
  return new Response(null, { status: hit.redirect.status, headers: { location } })
})
