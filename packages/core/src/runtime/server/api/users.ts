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
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { assertMigrated, audit, requireUser, useAtelierAuth, useAtelierRoles } from '../index'
import { apiError, readValid } from '../errors'

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
      throw apiError(422, `There's no role "${name}"`)
  }
  const adminOnly = () => apiError(403, 'Only an administrator can grant the admin role or change an administrator')
  const target = async () => {
    const users = await auth.users.list()
    if (!users.some(u => u.id === id))
      throw apiError(404, `No user "${id}"`)
    return users
  }

  if (!id && method === 'GET')
    return auth.users.list()
  if (!id && method === 'POST') {
    const body = await readValid(event, NewUser)
    if (body.role === ADMIN_ROLE && actor.role !== ADMIN_ROLE)
      throw adminOnly()
    await knownRole(body.role)
    const created = await auth.users.create(body)
    await audit(event, { action: 'user.created', actorId: actor.id, target: { type: 'user', id: created.id }, details: { email: created.email, role: created.role } })
    return created
  }
  if (id && method === 'PATCH') {
    const changes = await readValid(event, Changes)
    await knownRole(changes.role)
    const users = await target()
    if (actor.role !== ADMIN_ROLE && (changes.role === ADMIN_ROLE || users.find(u => u.id === id)!.role === ADMIN_ROLE))
      throw adminOnly()
    if (changes.role !== undefined && id === actor.id && actor.role !== ADMIN_ROLE)
      throw apiError(403, 'You can\'t change your own role')
    if (changes.role !== undefined && changes.role !== ADMIN_ROLE && isLastAdmin(users, id))
      throw apiError(409, 'This is the last administrator: make another user an administrator first', {}, 'last_admin')
    const before = users.find(u => u.id === id)!
    const updated = await auth.users.update(id, changes)
    const changed: Record<string, unknown> = Object.fromEntries((['email', 'name', 'role'] as const)
      .filter(key => changes[key] !== undefined && changes[key] !== before[key])
      .map(key => [key, { from: before[key] ?? null, to: updated[key] ?? null }]))
    if (changes.password !== undefined)
      changed.password = 'changed' // never the password itself
    await audit(event, { action: 'user.updated', actorId: actor.id, target: { type: 'user', id }, details: changed })
    return updated
  }
  if (id && method === 'DELETE') {
    const users = await target()
    if (actor.role !== ADMIN_ROLE && users.find(u => u.id === id)!.role === ADMIN_ROLE)
      throw adminOnly()
    if (isLastAdmin(users, id))
      throw apiError(409, 'This is the last administrator: make another user an administrator first', {}, 'last_admin')
    const deleted = users.find(u => u.id === id)!
    await auth.users.delete(id)
    await audit(event, { action: 'user.deleted', actorId: actor.id, target: { type: 'user', id }, details: { email: deleted.email, role: deleted.role } })
    return { ok: true }
  }
  throw apiError(405, 'Method not allowed')
})
