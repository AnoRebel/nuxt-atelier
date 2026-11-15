// First-run setup: while there are no users, creates the first administrator and signs them in.
//   GET   { needed, token }  whether setup is still open, and whether it takes the setup token
//   POST  { email, name?, password, token? }
// With NUXT_ATELIER_AUTH_SETUP_TOKEN set, setup takes that token too: a public deploy can't be claimed by
// whoever finds it before its owner does.
import * as v from 'valibot'
import { defineEventHandler } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { EDITOR_ROLE } from '../auth/roles'
import { assertMigrated, audit, useAtelierAuth, useAtelierRoles, useAtelierServerConfig } from '../index'
import { apiError, readValid } from '../errors'

const Admin = v.object({
  email: v.pipe(v.string(), v.trim(), v.email('Enter an email address'), v.maxLength(255)),
  name: v.optional(v.pipe(v.string(), v.maxLength(255))),
  password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'), v.maxLength(1024)),
  token: v.optional(v.pipe(v.string(), v.maxLength(1024))),
})

/** Compares in time that doesn't depend on where the strings differ. */
async function same(a: string, b: string): Promise<boolean> {
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  const [x, y] = await Promise.all([digest(a), digest(b)])
  return x.reduce((diff, byte, i) => diff | (byte ^ y[i]!), 0) === 0
}

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const auth = await useAtelierAuth()
  const needed = (await auth.users.list()).length === 0
  const token = (useAtelierServerConfig().auth as { setupToken?: string }).setupToken || ''
  if (event.req.method === 'GET')
    return { needed, token: !!token }
  if (event.req.method !== 'POST')
    throw apiError(405, 'Method not allowed')
  if (!needed) // the screen and the endpoint close for good once any user exists
    throw apiError(409, 'Setup is done: sign in instead', {}, 'setup_done')

  const { token: given, ...body } = await readValid(event, Admin)
  if (token && !await same(given ?? '', token))
    throw apiError(403, 'Enter the setup token: NUXT_ATELIER_AUTH_SETUP_TOKEN on the server', {}, 'setup_token')
  // ponytail: two setups racing within the same instant could both create an admin; harmless (both are admins) and only possible before the first one finishes
  const user = await auth.users.create({ ...body, role: ADMIN_ROLE })
  const roles = await useAtelierRoles()
  if (!await roles.exists('editor'))
    await roles.save('editor', EDITOR_ROLE)
  await auth.signIn(event, { email: body.email, password: body.password })
  await audit(event, { action: 'setup.completed', actorId: user.id, target: { type: 'user', id: user.id }, details: { email: user.email } })
  return user
})
