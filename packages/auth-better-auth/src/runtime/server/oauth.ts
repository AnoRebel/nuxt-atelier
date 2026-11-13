// Starts an OAuth sign-in with a link: GET /api/_atelier/auth/oauth/<provider>?redirect=/admin
// Better Auth's own start is a POST that answers the provider's address; this does the POST and redirects,
// keeping Better Auth's state cookie, so a sign-in screen needs no Better Auth code in the browser.
// `redirect`, where to come back to, must be a path on this site.
import config from '#atelier-better-auth'
import { defineEventHandler, getQuery, getRequestURL } from 'nuxt/server'
import { apiError } from '#atelier/server'
import { useBetterAuth } from './adapter'

const PREFIX = '/api/_atelier/auth/oauth/'

export default defineEventHandler(async (event) => {
  const provider = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length))
  const redirect = String(getQuery(event).redirect ?? '/')
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\'))
    throw apiError(400, 'redirect: expected a path on this site, like /admin')
  const auth = await useBetterAuth(config)
  // through Better Auth's own handler, as the browser would, so it knows this site's address
  const headers = new Headers(event.req.headers)
  headers.set('content-type', 'application/json')
  const started = await auth.handler(new Request(new URL('/api/auth/sign-in/social', getRequestURL(event).origin), {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider, callbackURL: redirect }),
  }))
  if (started.status === 429)
    throw apiError(429, 'Too many sign-in attempts: try again in a minute')
  if (!started.ok)
    throw apiError(started.status === 404 ? 404 : 400, `No sign-in with "${provider}"`)
  const { url } = await started.json() as { url: string }
  const response = new Response(null, { status: 302, headers: { location: url } })
  for (const cookie of started.headers.getSetCookie())
    response.headers.append('set-cookie', cookie)
  return response
})
