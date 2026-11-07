// CSRF protection for the CMS API. Unsafe requests (anything but GET, HEAD, OPTIONS) to /api/_atelier/:
//   1. a browser's `Sec-Fetch-Site` must be `same-origin` (or `none`: typed in, a bookmark);
//   2. an `Origin` must be this server's, or the public site URL's;
//   3. a signed-in request must echo its session's CSRF token in `x-atelier-csrf`. The token sits in the
//      sealed session cookie, so a cookie planted from a sibling subdomain can't supply a matching one.
// Requests from non-browser clients send neither header and carry no session cookie, so 1 and 2 pass
// and 3 doesn't apply; they authenticate another way (API tokens).
import { createError, defineEventHandler, getRequestHeader, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import { useAtelierAuth } from '../index'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (SAFE.has(event.req.method) || !url.pathname.startsWith('/api/_atelier/'))
    return

  const refuse = (why: string) => createError({ status: 403, message: `Cross-site request refused: ${why}` })
  const site = getRequestHeader(event, 'sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none')
    throw refuse(`Sec-Fetch-Site is ${site}`)
  const origin = getRequestHeader(event, 'origin')
  if (origin) {
    const siteUrl = (useRuntimeConfig().public as { atelier?: { siteUrl?: string } }).atelier?.siteUrl
    const allowed = [url.host, ...siteUrl ? [new URL(siteUrl).host] : []]
    const host = URL.canParse(origin) ? new URL(origin).host : undefined // `null` from sandboxed frames
    if (!host || !allowed.includes(host))
      throw refuse(`Origin ${origin} isn't this site`)
  }

  const expected = await (await useAtelierAuth()).csrfToken?.(event)
  if (expected !== undefined && getRequestHeader(event, 'x-atelier-csrf') !== expected)
    throw refuse('the x-atelier-csrf header is missing or wrong')
})
