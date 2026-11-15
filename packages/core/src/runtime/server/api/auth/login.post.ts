// Signing in with email and password (the built-in auth adapter, or the app's):
//   POST  /api/_atelier/auth/login   { email, password }: sets the session cookie; limited per email and IP
// The limit per email alone (any IP) would let anyone lock an account out with wrong passwords, so a browser
// that signed in as that email before carries a signed device cookie that skips it (OWASP's device cookies):
// only the limit per IP and email applies to it.
import * as v from 'valibot'
import { defineEventHandler, getCookie, isNuxtError, setCookie } from 'nuxt/server'
import { assertMigrated, audit, signInLimits, useAtelierAuth, useAtelierRateLimiter } from '../../index'
import { readValid } from '../../errors'
import { logger } from '../../logger'
import { signToken, verifyToken } from '../../secrets'
import { requestIdOf } from '../../middleware/request-id'

const DEVICE_COOKIE = 'atelier-device'
const DEVICE_PURPOSE = 'nuxt-atelier:sign-in-device'
const DEVICE_AGE = 180 * 24 * 60 * 60 // seconds

const Credentials = v.object({ email: v.pipe(v.string(), v.maxLength(255)), password: v.pipe(v.string(), v.maxLength(1024)) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const credentials = await readValid(event, Credentials)
  const limiter = await useAtelierRateLimiter()
  const email = credentials.email.trim().toLowerCase()
  const device = await verifyToken<{ m: string, e: number }>(DEVICE_PURPOSE, getCookie(event, DEVICE_COOKIE) ?? '')
  const known = device?.m === email && device.e > Date.now()
  const limits = signInLimits(event, email)
  await limiter.check(event, known ? limits.slice(0, 1) : limits) // refused even with the right password, until the window ends
  try {
    const user = await (await useAtelierAuth()).signIn(event, credentials)
    await limiter.reset(limits.slice(0, 1))
    setCookie(event, DEVICE_COOKIE, await signToken(DEVICE_PURPOSE, { m: email, e: Date.now() + DEVICE_AGE * 1000 }), { path: '/api/_atelier/auth', httpOnly: true, sameSite: 'strict', secure: true, maxAge: DEVICE_AGE })
    await audit(event, { action: 'auth.sign-in', actorId: user.id, target: { type: 'user', id: user.id }, details: { method: 'password' } })
    return user
  }
  catch (error) {
    if (isNuxtError(error) && error.status === 401) {
      await limiter.hit(limits)
      await audit(event, { action: 'auth.sign-in-failed', actorId: null, details: { method: 'password', email } })
      logger.warn('Sign-in failed', { event: 'auth.sign-in-failed', method: 'password', requestId: requestIdOf(event) })
    }
    throw error
  }
})
