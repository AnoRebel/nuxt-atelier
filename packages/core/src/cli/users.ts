// `atelier user …`: an operator's way in when nobody can sign in. Works on the built-in auth adapter's
// tables directly (the CLI runs outside the Nuxt server), with the same password hashing.
import type { AtelierDriver } from '../runtime/server/db/driver'
import type { Db } from '../runtime/server/db/entries'
import { eq } from 'drizzle-orm'
import { createAuditLog } from '../runtime/server/auth/audit'
import { hashPassword } from '../runtime/server/auth/password'
import { buildTables } from '../runtime/server/db/tables'
import { ADMIN_ROLE } from '../runtime/shared/policy'

/** A password to hand out: 20 random characters, URL-safe. */
export const randomPassword = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(15)))).replaceAll('+', '-').replaceAll('/', '_')

function checkPassword(password: string) {
  if (password.length < 8 || password.length > 1024)
    throw new Error('Use a password of at least 8 characters')
}

const tablesOf = (driver: AtelierDriver) => buildTables(driver.dialect, { collections: {}, singletons: {} })

/** Creates an administrator. Refuses an email that's taken. */
export async function createAdmin(driver: AtelierDriver, input: { email: string, name?: string, password: string }): Promise<{ id: string, email: string }> {
  checkPassword(input.password)
  const { atelier_users: users } = tablesOf(driver)
  const db = driver.db as Db
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+$/.test(email))
    throw new Error(`"${input.email}" isn't an email address`)
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length)
    throw new Error(`A user with the email ${email} already exists: use \`atelier user reset-password\``)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.insert(users).values({ id, email, name: input.name ?? null, role: ADMIN_ROLE, passwordHash: await hashPassword(input.password), createdAt: now, updatedAt: now })
  await createAuditLog(driver).record({ action: 'user.created', actorId: null, target: { type: 'user', id }, details: { email, role: ADMIN_ROLE, by: 'cli' } })
  return { id, email }
}

/** Sets a user's password and signs them out everywhere (every session is deleted). */
export async function resetPassword(driver: AtelierDriver, input: { email: string, password: string }): Promise<{ id: string, sessions: number }> {
  checkPassword(input.password)
  const { atelier_users: users, atelier_sessions: sessions } = tablesOf(driver)
  const db = driver.db as Db
  const email = input.email.trim().toLowerCase()
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!user)
    throw new Error(`No user with the email ${email}`)
  await db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: new Date().toISOString() }).where(eq(users.id, user.id))
  const revoked: unknown[] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id))
  await db.delete(sessions).where(eq(sessions.userId, user.id))
  await createAuditLog(driver).record({ action: 'user.updated', actorId: null, target: { type: 'user', id: user.id }, details: { password: 'changed', sessions: 'revoked', by: 'cli' } })
  return { id: user.id, sessions: revoked.length }
}
