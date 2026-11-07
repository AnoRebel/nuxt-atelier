// Passkey (WebAuthn) routes of the built-in auth adapter, registered only with `auth.passkeys`:
//
//   POST   register-options   signed in: options for navigator.credentials.create()
//   POST   register           signed in: { response, name? } stores the new passkey
//   POST   login-options      options for navigator.credentials.get() (discoverable credentials)
//   POST   login              { response } signs in as the passkey's user
//   GET    /                  signed in: your passkeys
//   DELETE /<id>              signed in: removes one of your passkeys
//
// A passkey is an extra way in: users add one after a password sign-in, and the password stays the
// recovery path. User verification is required and the signature counter is checked.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { RequestEvent } from 'nuxt/server'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { and, eq } from 'drizzle-orm'
import { clearSession, createError, defineEventHandler, getRequestURL, readBody, useRuntimeConfig, useSession } from 'nuxt/server'
import { buildTables } from '../../db/tables'
import { assertMigrated, useAtelierAuth, useAtelierDatabase } from '../../index'

const PREFIX = '/api/_atelier/auth/passkeys'
// the pending challenge lives in its own short-lived sealed cookie, so it works before sign-in too
const CHALLENGE = { name: 'atelier-passkey', maxAge: 300 }

/** The relying party: the public site URL, or this request's origin when it isn't set (development). */
function relyingParty(event: RequestEvent) {
  const site = (useRuntimeConfig().public as { atelier?: { siteUrl?: string } }).atelier?.siteUrl
  const origin = new URL(site || getRequestURL(event).origin).origin
  return { origin, id: new URL(origin).hostname }
}

async function challenge(event: RequestEvent, set?: { challenge: string, userId?: string }) {
  const session = await useSession<{ challenge?: string, userId?: string }>(event, CHALLENGE)
  if (set) {
    await session.update(set)
    return set
  }
  const data = { ...session.data }
  await clearSession(event, CHALLENGE) // one use
  if (!data.challenge)
    throw createError({ status: 400, message: 'No passkey challenge in progress, or it expired: start again' })
  return data as { challenge: string, userId?: string }
}

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const auth = await useAtelierAuth()
  const driver = await useAtelierDatabase()
  const db = driver.db as any // eslint-disable-line @typescript-eslint/no-explicit-any -- one code path for the three dialects
  const { atelier_passkeys: passkeys } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const rp = relyingParty(event)
  const action = getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, '')
  const method = event.req.method

  const signedIn = async () => {
    const user = await auth.getUser(event)
    if (!user)
      throw createError({ status: 401, message: 'Sign in first' })
    return user
  }

  if (method === 'POST' && action === 'register-options') {
    const user = await signedIn()
    const existing: { id: string, transports: string[] | null }[] = await db.select().from(passkeys).where(eq(passkeys.userId, user.id))
    const options = await generateRegistrationOptions({
      rpName: rp.id,
      rpID: rp.id,
      userName: user.email,
      userDisplayName: user.name ?? user.email,
      userID: new TextEncoder().encode(user.id),
      excludeCredentials: existing.map(p => ({ id: p.id, transports: p.transports ?? undefined })) as never,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    await challenge(event, { challenge: options.challenge, userId: user.id })
    return options
  }

  if (method === 'POST' && action === 'register') {
    const user = await signedIn()
    const { response, name } = await readBody<{ response: RegistrationResponseJSON, name?: string }>(event)
    const pending = await challenge(event)
    if (pending.userId !== user.id)
      throw createError({ status: 400, message: 'The passkey challenge belongs to another user' })
    const result = await verifyRegistrationResponse({ response, expectedChallenge: pending.challenge, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true })
      .catch((error: Error) => ({ verified: false as const, error }))
    if (!result.verified)
      throw createError({ status: 400, message: `The passkey couldn't be verified${'error' in result ? `: ${result.error.message}` : ''}` })
    const { credential } = result.registrationInfo
    await db.insert(passkeys).values({
      id: credential.id,
      userId: user.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      name: typeof name === 'string' ? name.slice(0, 255) : null,
      createdAt: new Date().toISOString(),
    })
    return { id: credential.id }
  }

  if (method === 'POST' && action === 'login-options') {
    const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'required' })
    await challenge(event, { challenge: options.challenge })
    return options
  }

  if (method === 'POST' && action === 'login') {
    const { response } = await readBody<{ response: AuthenticationResponseJSON }>(event)
    const pending = await challenge(event)
    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, String(response?.id))).limit(1)
    const refused = () => createError({ status: 401, message: 'This passkey isn\'t recognised' })
    if (!passkey)
      throw refused()
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: { id: passkey.id, publicKey: isoBase64URL.toBuffer(passkey.publicKey), counter: Number(passkey.counter), transports: passkey.transports ?? undefined },
    }).catch(() => undefined) // includes a counter that went backwards: a cloned authenticator
    if (!result?.verified)
      throw refused()
    await db.update(passkeys).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() }).where(eq(passkeys.id, passkey.id))
    await auth.startSession(event, passkey.userId, 'passkey')
    return auth.users.get(passkey.userId)
  }

  if (method === 'GET' && action === '') {
    const user = await signedIn()
    return db.select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt })
      .from(passkeys).where(eq(passkeys.userId, user.id)).orderBy(passkeys.createdAt)
  }

  if (method === 'DELETE' && action) {
    const user = await signedIn()
    await db.delete(passkeys).where(and(eq(passkeys.id, decodeURIComponent(action)), eq(passkeys.userId, user.id)))
    return { ok: true }
  }

  throw createError({ status: 404, message: 'Not found' })
})
