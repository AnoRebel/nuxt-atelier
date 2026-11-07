// User management, for roles with the `users` capability:
//   GET     /                 every user
//   POST    /                 { email, name?, role, password? }
//   PATCH   /<id>             { email?, name?, role?, password? }  a password change signs them out everywhere
//   DELETE  /<id>
// The last administrator can't lose the admin role or be deleted, so the CMS can't be locked out.
// Only administrators can grant the admin role or change an administrator, and nobody can change
// their own role: otherwise the `users` capability would be a way to become an administrator.
import type { AuthUser } from '../auth/adapter'
import * as v from 'valibot'
import { createError, defineEventHandler, getRequestURL, readValidatedBody } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { assertMigrated, requireUser, useAtelierAuth, useAtelierRoles } from '../index'

const PREFIX = '/api/_atelier/users'
const email = v.pipe(v.string(), v.trim(), v.email('Enter an email address'), v.maxLength(255))
const password = v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'), v.maxLength(1024))
const name = v.nullish(v.pipe(v.string(), v.maxLength(255)))
const role = v.pipe(v.string(), v.maxLength(64))
const NewUser = v.object({ email, name, role, password: v.optional(password) })
const Changes = v.object({ email: v.optional(email), name, role: v.optional(role), password: v.optional(password) })

const isLastAdmin = (users: AuthUser[], id: string) =>
  users.find(u => u.id === id)?.role === ADMIN_ROLE && users.filter(u => u.role === ADMIN_ROLE).length === 1

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const actor = await requireUser(event, 'users')
  const auth = await useAtelierAuth()
  const id = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, ''))
  const method = event.req.method

  const knownRole = async (name: string | undefined) => {
    if (name !== undefined && !await (await useAtelierRoles()).exists(name))
      throw createError({ status: 422, message: `There's no role "${name}"` })
  }
  const adminOnly = () => createError({ status: 403, message: 'Only an administrator can grant the admin role or change an administrator' })
  const target = async () => {
    const users = await auth.users.list()
    if (!users.some(u => u.id === id))
      throw createError({ status: 404, message: `No user "${id}"` })
    return users
  }

  if (!id && method === 'GET')
    return auth.users.list()
  if (!id && method === 'POST') {
    const body = await readValidatedBody(event, NewUser)
    if (body.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE)
      throw adminOnly()
    await knownRole(body.role)
    return auth.users.create(body)
  }
  if (id && method === 'PATCH') {
    const changes = await readValidatedBody(event, Changes)
    await knownRole(changes.role)
    const users = await target()
    if (actor.role !== ADMIN_ROLE && (changes.role === ADMIN_ROLE || users.find(u => u.id === id)!.role === ADMIN_ROLE))
      throw adminOnly()
    if (changes.role !== undefined && id === actor.id && actor.role !== ADMIN_ROLE)
      throw createError({ status: 403, message: 'You can\'t change your own role' })
    if (changes.role !== undefined && changes.role !== ADMIN_ROLE && isLastAdmin(users, id))
      throw createError({ status: 409, message: 'This is the last administrator: make another user an administrator first' })
    return auth.users.update(id, changes)
  }
  if (id && method === 'DELETE') {
    const users = await target()
    if (actor.role !== ADMIN_ROLE && users.find(u => u.id === id)!.role === ADMIN_ROLE)
      throw adminOnly()
    if (isLastAdmin(users, id))
      throw createError({ status: 409, message: 'This is the last administrator: make another user an administrator first' })
    await auth.users.delete(id)
    return { ok: true }
  }
  throw createError({ status: 405, message: 'Method not allowed' })
})
