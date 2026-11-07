// The built-in auth adapter: email and password users in the CMS database, signed in with a sealed,
// HTTP-only session cookie (`nuxt/server` `useSession`). The cookie holds a random session id whose
// SHA-256 is stored server-side, so signing out, a password change or deleting the user revokes it.
import type { RequestEvent } from 'nuxt/server'
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import type { AuthAdapter, AuthUser, NewUser } from './adapter'
import { and, eq, gt, lt } from 'drizzle-orm'
import { clearSession, createError, getCookie, getSession, updateSession } from 'nuxt/server'
import { buildTables } from '../db/tables'
import { defineAuthAdapter } from './adapter'
import { hashPassword, verifyPassword } from './password'

const SESSION_COOKIE = 'atelier-session'

export interface BuiltinAuthOptions {
  /** How long a session lasts, in seconds. Default: 7 days. */
  maxAge?: number
}

type SignInMethod = 'password' | 'passkey'

export interface BuiltinAuthAdapter extends AuthAdapter {
  /** Starts a session for a user already authenticated another way (a passkey). */
  startSession: (event: RequestEvent, userId: string, method: SignInMethod) => Promise<void>
  /** Signs the user out everywhere. */
  revokeSessions: (userId: string) => Promise<void>
}

const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer)

const toUser = (row: { id: string, email: string, name: string | null, role: string }): AuthUser =>
  ({ id: row.id, email: row.email, name: row.name, role: row.role })

export function createBuiltinAuth(driver: AtelierDriver, options: BuiltinAuthOptions = {}): BuiltinAuthAdapter {
  const maxAge = options.maxAge ?? 7 * 24 * 3600
  const config = { name: SESSION_COOKIE, maxAge }
  const { atelier_users: users, atelier_sessions: sessions, atelier_passkeys: passkeys } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db

  const byEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1))[0]
  const byId = async (id: string) => (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]

  // compared against for unknown emails, so a response doesn't reveal whether the email exists
  let dummyHash: Promise<string> | undefined

  async function sessionId(event: RequestEvent): Promise<string | undefined> {
    if (!getCookie(event, SESSION_COOKIE)) // getSession would start (and set) an empty session
      return undefined
    const { data } = await getSession<{ sid?: string }>(event, config)
    return data.sid
  }

  async function startSession(event: RequestEvent, userId: string, method: SignInMethod) {
    const now = new Date()
    const sid = randomId()
    await db.delete(sessions).where(lt(sessions.expiresAt, now.toISOString())) // ponytail: expired rows are swept at sign-in; move to a scheduled task if sign-ins are rare
    await db.insert(sessions).values({ id: await sha256(sid), userId, method, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + maxAge * 1000).toISOString() })
    await updateSession(event, config, { sid })
  }

  const revokeSessions = async (userId: string) => {
    await db.delete(sessions).where(eq(sessions.userId, userId))
  }

  async function emailFree(email: string, exceptId?: string) {
    const existing = await byEmail(email)
    if (existing && existing.id !== exceptId)
      throw createError({ status: 409, message: `A user with the email ${email} already exists` })
  }

  return defineAuthAdapter({
    name: 'builtin',

    async getUser(event) {
      const sid = await sessionId(event)
      if (!sid)
        return null
      const [row] = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, await sha256(sid)), gt(sessions.expiresAt, new Date().toISOString())))
        .limit(1)
      return row ? toUser(row) : null
    },

    async signIn(event, { email, password }) {
      const row = await byEmail(String(email))
      const check = await verifyPassword(String(password), row?.passwordHash ?? await (dummyHash ??= hashPassword(randomId())))
      if (!row?.passwordHash || !check.valid)
        throw createError({ status: 401, message: 'Wrong email or password' })
      if (check.needsRehash)
        await db.update(users).set({ passwordHash: await hashPassword(String(password)) }).where(eq(users.id, row.id))
      await startSession(event, row.id, 'password')
      return toUser(row)
    },

    async signOut(event) {
      const sid = await sessionId(event)
      if (sid)
        await db.delete(sessions).where(eq(sessions.id, await sha256(sid)))
      await clearSession(event, config)
    },

    startSession,
    revokeSessions,

    users: {
      list: async () => (await db.select().from(users).orderBy(users.email)).map(toUser),
      get: async id => (await byId(id).then(row => row && toUser(row))) ?? null,

      async create(user: NewUser) {
        await emailFree(user.email)
        const now = new Date().toISOString()
        const row = {
          id: crypto.randomUUID(),
          email: user.email.trim().toLowerCase(),
          name: user.name ?? null,
          role: user.role,
          passwordHash: user.password === undefined ? null : await hashPassword(user.password),
          createdAt: now,
          updatedAt: now,
        }
        await db.insert(users).values(row)
        return toUser(row)
      },

      async update(id, changes) {
        if (!await byId(id))
          throw createError({ status: 404, message: `No user "${id}"` })
        if (changes.email !== undefined)
          await emailFree(changes.email, id)
        await db.update(users).set({
          ...changes.email === undefined ? {} : { email: changes.email.trim().toLowerCase() },
          ...changes.name === undefined ? {} : { name: changes.name },
          ...changes.role === undefined ? {} : { role: changes.role },
          ...changes.password === undefined ? {} : { passwordHash: await hashPassword(changes.password) },
          updatedAt: new Date().toISOString(),
        }).where(eq(users.id, id))
        if (changes.password !== undefined) // a reset signs out every session, including a stolen one
          await revokeSessions(id)
        return toUser((await byId(id))!)
      },

      async delete(id) {
        await revokeSessions(id)
        await db.delete(passkeys).where(eq(passkeys.userId, id))
        await db.delete(users).where(eq(users.id, id))
      },
    },
  })
}
