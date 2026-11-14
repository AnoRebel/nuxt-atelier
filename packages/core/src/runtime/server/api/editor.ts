// The visual editor's way into a page:
//   POST  /api/_atelier/editor/token     { type, id? }: for someone who may update the entry, a token good for two
//                                       minutes and the entry's draft URL to open with it (`?_atelier=edit&_atelier_token=…`)
//   POST  /api/_atelier/editor/session   { token }: the page exchanges it for an HTTP-only edit cookie (8 hours)
//   GET   /api/_atelier/editor/session   whether this browser is in an edit session (the cookie, for the same user)
// The page loads the editor bridge only after one of the two answers yes; without, it's the public page.
import type { RequestEvent } from 'nuxt/server'
import { defineEventHandler, deleteCookie, getCookie, setCookie } from 'nuxt/server'
import * as v from 'valibot'
import { allow, caller, segments } from '../content-access'
import { apiError, readValid } from '../errors'
import { useAtelierAuth, useAtelierEntries, useAtelierSchema, useAtelierSite } from '../index'
import { signToken, verifyToken } from '../secrets'

const TOKEN = 'nuxt-atelier:editor-token'
const SESSION = 'nuxt-atelier:editor-session'
const COOKIE = 'atelier-edit'
const TOKEN_TTL = 120_000
const SESSION_TTL = 8 * 3600_000

const Open = v.object({ type: v.pipe(v.string(), v.maxLength(64)), id: v.optional(v.pipe(v.string(), v.maxLength(255))) })
const Exchange = v.object({ token: v.pipe(v.string(), v.maxLength(2000)) })

/** The signed-in user's id, or a 401: an edit session is always someone's. */
async function signedIn(event: RequestEvent): Promise<string> {
  const user = await (await useAtelierAuth()).getUser(event)
  if (!user)
    throw apiError(401, 'Sign in first')
  return user.id
}

export default defineEventHandler(async (event) => {
  const [action, ...rest] = segments(event, '/api/_atelier/editor')
  if (rest.length)
    throw apiError(404, 'Not found')
  const method = event.req.method

  if (action === 'token' && method === 'POST') {
    const { type, id } = await readValid(event, Open)
    const who = await caller(event)
    const schema = await useAtelierSchema()
    const entries = await useAtelierEntries(who.site)
    const singleton = type in schema.singletons
    const definition = schema.collections[type] ?? schema.singletons[type]
    if (!definition || (!singleton && !id))
      throw apiError(404, `No entry to edit in "${type}"`)
    if (!definition.route)
      throw apiError(422, `"${type}" has no pages to edit visually`)
    const entry = singleton ? await entries.getSingleton(type, { stage: 'draft' }) : await entries.get(type, id!, { stage: 'draft' })
    allow(who, 'update', type, entry && 'createdBy' in entry ? entry : undefined)
    if (!entry?.path)
      throw apiError(422, 'This entry has no URL yet: fill in what its address is made from, and save')
    const token = await signToken(TOKEN, { u: who.principal.id, s: who.site.name, e: Date.now() + TOKEN_TTL })
    return { token, url: `${entry.path}?_atelier=edit&_atelier_token=${encodeURIComponent(token)}` }
  }

  if (action === 'session' && method === 'POST') {
    const { token } = await readValid(event, Exchange)
    const userId = await signedIn(event)
    const payload = await verifyToken<{ u: string, s: string, e: number }>(TOKEN, token)
    // the token is the signed-in user's own, and fresh: a link someone else made doesn't open their editor
    if (!payload || payload.u !== userId || payload.e < Date.now() || payload.s !== useAtelierSite(event).name)
      throw apiError(403, 'This edit link is invalid or expired: open the editor again')
    const session = await signToken(SESSION, { u: userId, s: payload.s, e: Date.now() + SESSION_TTL })
    setCookie(event, COOKIE, session, { path: '/', httpOnly: true, sameSite: 'strict', secure: true, maxAge: SESSION_TTL / 1000 })
    return { ok: true }
  }

  if (action === 'session' && method === 'GET') {
    const cookie = getCookie(event, COOKIE)
    const payload = cookie ? await verifyToken<{ u: string, s: string, e: number }>(SESSION, cookie) : undefined
    const userId = (await (await useAtelierAuth()).getUser(event))?.id
    if (!payload || payload.e < Date.now() || payload.u !== userId || payload.s !== useAtelierSite(event).name) {
      if (cookie)
        deleteCookie(event, COOKIE, { path: '/' })
      throw apiError(403, 'Not in an edit session')
    }
    return { ok: true }
  }
  throw apiError(404, 'Not found')
})
