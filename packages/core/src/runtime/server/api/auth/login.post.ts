import * as v from 'valibot'
import { defineEventHandler, isNuxtError, readValidatedBody } from 'nuxt/server'
import { assertMigrated, audit, signInLimits, useAtelierAuth, useAtelierRateLimiter } from '../../index'

const Credentials = v.object({ email: v.pipe(v.string(), v.maxLength(255)), password: v.pipe(v.string(), v.maxLength(1024)) })

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const credentials = await readValidatedBody(event, Credentials)
  const limiter = await useAtelierRateLimiter()
  const email = credentials.email.trim().toLowerCase()
  const limits = signInLimits(event, email)
  await limiter.check(event, limits) // refused even with the right password, until the window ends
  try {
    const user = await (await useAtelierAuth()).signIn(event, credentials)
    await limiter.reset(limits.slice(0, 1))
    await audit(event, { action: 'auth.sign-in', actorId: user.id, target: { type: 'user', id: user.id }, details: { method: 'password' } })
    return user
  }
  catch (error) {
    if (isNuxtError(error) && error.status === 401) {
      await limiter.hit(limits)
      await audit(event, { action: 'auth.sign-in-failed', actorId: null, details: { method: 'password', email } })
    }
    throw error
  }
})
