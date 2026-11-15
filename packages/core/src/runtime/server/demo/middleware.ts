// Demo mode: the template is everyone's, so the CMS API takes no change outside a demo session: not even
// signing in (sessions sign their visitor in themselves). Starting and ending a demo is always allowed.
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { apiError } from '../errors'
import { sessionOf } from './sessions'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  if (SAFE.has(event.req.method) || !pathname.startsWith('/api/_atelier/') || pathname.startsWith('/api/_atelier/demo'))
    return
  if (!sessionOf(event))
    throw apiError(403, 'This is a demo: start one to make changes, in a copy of the site of your own', {}, 'demo')
})
