// Demo mode (`demo.enabled`):
//   GET     /api/_atelier/demo/start?to=/admin   starts a demo: a copy of the site of the visitor's own, signed in as its administrator; then goes to `to`
//   GET     /api/_atelier/demo                   { active, secondsLeft, idleTimeout }: the visitor's demo
//   DELETE  /api/_atelier/demo                   ends it, deleting the copy
import { defineEventHandler, deleteCookie, getCookie, getQuery, sendRedirect, setCookie } from 'nuxt/server'
import { clientIp } from '../auth/rate-limit'
import { segments } from '../content-access'
import { apiError } from '../errors'
import { useAtelierAuth, useAtelierDatabase, useAtelierServerConfig } from '../index'
import { DEMO_COOKIE, endSession, secondsLeft, sessionOf, startSession } from '../demo/sessions'
import type { DemoConfig } from '../demo/sessions'

const DEMO_USER = { email: 'demo@nuxt-atelier.dev', name: 'Demo', role: 'admin' }

export default defineEventHandler(async (event) => {
  const config = useAtelierServerConfig() as unknown as { demo: DemoConfig, auth: { trustProxy: boolean } }
  const [, action, ...rest] = segments(event, '/api/_atelier/')
  if (rest.length || (action && action !== 'start'))
    throw apiError(404, 'Not found')

  if (action === 'start' && event.req.method === 'GET') {
    const to = String(getQuery(event).to ?? '/admin')
    const target = to.startsWith('/') && !to.startsWith('//') && !to.includes('\\') ? to : '/admin'
    if (sessionOf(event))
      return sendRedirect(event, target, 302)
    const auth = await useAtelierAuth()
    if (!auth.startSession)
      throw apiError(500, 'The demo needs the built-in auth adapter')
    // the demo's administrator, in the template, so every copy has them
    const user = (await auth.users.list()).find(u => u.email === DEMO_USER.email) ?? await auth.users.create(DEMO_USER)
    const address = clientIp(event, config.auth.trustProxy)
    const id = await startSession(event, await useAtelierDatabase(), config.demo, address, () => auth.startSession!(event, user.id, 'password'))
    setCookie(event, DEMO_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: !import.meta.dev })
    return sendRedirect(event, target, 302)
  }
  if (!action && event.req.method === 'GET')
    return { active: !!sessionOf(event), secondsLeft: secondsLeft(event, config.demo.idleTimeout), idleTimeout: config.demo.idleTimeout }
  if (!action && event.req.method === 'DELETE') {
    const id = getCookie(event, DEMO_COOKIE)
    if (id)
      await endSession(id)
    deleteCookie(event, DEMO_COOKIE, { path: '/' })
    return { ok: true }
  }
  throw apiError(405, `${event.req.method} isn't allowed here`)
})
