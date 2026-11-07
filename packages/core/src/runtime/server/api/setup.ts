// First-run setup: while there are no users, creates the first administrator and signs them in.
//   GET   { needed }       whether setup is still open
//   POST  { email, name?, password }
import * as v from 'valibot'
import { createError, defineEventHandler, readValidatedBody } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { EDITOR_ROLE } from '../auth/roles'
import { assertMigrated, audit, useAtelierAuth, useAtelierRoles } from '../index'

const Admin = v.object({
  email: v.pipe(v.string(), v.trim(), v.email('Enter an email address'), v.maxLength(255)),
  name: v.optional(v.pipe(v.string(), v.maxLength(255))),
  password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'), v.maxLength(1024)),
})

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const auth = await useAtelierAuth()
  const needed = (await auth.users.list()).length === 0
  if (event.req.method === 'GET')
    return { needed }
  if (event.req.method !== 'POST')
    throw createError({ status: 405, message: 'Method not allowed' })
  if (!needed) // the screen and the endpoint close for good once any user exists
    throw createError({ status: 409, message: 'Setup is done: sign in instead' })

  const body = await readValidatedBody(event, Admin)
  // ponytail: two setups racing within the same instant could both create an admin; harmless (both are admins) and only possible before the first one finishes
  const user = await auth.users.create({ ...body, role: ADMIN_ROLE })
  const roles = await useAtelierRoles()
  if (!await roles.exists('editor'))
    await roles.save('editor', EDITOR_ROLE)
  await auth.signIn(event, { email: body.email, password: body.password })
  await audit(event, { action: 'setup.completed', actorId: user.id, target: { type: 'user', id: user.id }, details: { email: user.email } })
  return user
})
