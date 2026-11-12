// A correlation id per request: the caller's `x-request-id` (a proxy's or load balancer's) when it's a
// plausible id, else a new one. On `event.context.atelierRequestId` for logs, and echoed in the response.
import { defineEventHandler, getRequestHeader } from 'nuxt/server'

const PLAUSIBLE = /^[\w.:-]{1,128}$/

export default defineEventHandler((event) => {
  const given = getRequestHeader(event, 'x-request-id')
  const id = given && PLAUSIBLE.test(given) ? given : crypto.randomUUID()
  ;(event.context as { atelierRequestId?: string }).atelierRequestId = id
  event.res.headers.set('x-request-id', id)
})

/** The request's correlation id, for log fields. */
export const requestIdOf = (event: { context: unknown }) => (event.context as { atelierRequestId?: string }).atelierRequestId
