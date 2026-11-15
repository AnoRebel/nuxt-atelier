// User management, for roles with the `users` capability:
//   GET     /api/_atelier/users  every user
//   POST    /api/_atelier/users  { email, name?, role, password? }
//   PATCH   /api/_atelier/users/<id>  { email?, name?, role?, password? }  a password change signs them out everywhere
//           and removes their passkeys (built-in auth): a reset shuts whatever way in an intruder had
//   DELETE  /api/_atelier/users/<id>
//   GET     /api/_atelier/users/<id>/sites  with `sites`: their role on each site, { shop: 'editor' } (administrators reach every site)
//   PUT     /api/_atelier/users/<id>/sites  { sites: { shop: 'editor' } }: replaces them; a site left out loses access
// The last administrator can't lose the admin role or be deleted, so the CMS can't be locked out.
// Only administrators can grant the admin role or change an administrator, and nobody can change
// their own role: otherwise the `users` capability would be a way to become an administrator.
// With sites, a manager who isn't an administrator holds `users` on one site only: they see and manage
// the users whose access is that site at most, change only that site's access, and never their own.
import type { AuthUser } from '../auth/adapter'
import * as v from 'valibot'
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { ADMIN_ROLE, PUBLIC_ROLE } from '../../shared/policy'
import { assertMigrated, atelierSites, audit, requireUser, useAtelierAuth, useAtelierRoles, useAtelierSite, useAtelierSiteRoles } from '../index'
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
  const [id = '', sub, ...rest] = getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, '').split('/').map(decodeURIComponent)
  const method = event.req.method
  if (rest.length || (sub !== undefined && sub !== 'sites'))
    throw apiError(404, 'Not found')

  const knownRole = async (name: string | undefined) => {
    if (name === PUBLIC_ROLE)
      throw apiError(422, `"${PUBLIC_ROLE}" is the role of visitors who aren't signed in; give users another one`)
    if (name !== undefined && !await (await useAtelierRoles()).exists(name))
      throw apiError(422, `There's no role "${name}"`)
  }
  const adminOnly = () => apiError(403, 'Only an administrator can grant the admin role or change an administrator')
  // with sites, a manager who isn't an administrator manages this site's users alone (see the top)
  const site = useAtelierSite(event)
  const local = site.scoped && actor.role !== ADMIN_ROLE ? site.name : undefined
  const siteRoles = local ? await useAtelierSiteRoles() : undefined
  const manageable = async (user: AuthUser) =>
    !local || (user.role !== ADMIN_ROLE && Object.keys(await siteRoles!.of(user.id)).every(s => s === local))
  const target = async () => {
    const users = await auth.users.list()
    const user = users.find(u => u.id === id)
    if (!user || !await manageable(user))
      throw apiError(404, `No user "${id}"`)
    return users
  }

  if (id && sub === 'sites') {
    const sites = atelierSites()
    if (!Object.keys(sites).length)
      throw apiError(404, 'Sites aren\'t configured')
    await target()
    const store = await useAtelierSiteRoles()
    if (method === 'PUT') {
      const body = await readValid(event, v.object({ sites: v.record(v.string(), role) }))
      if (local) {
        if (id === actor.id)
          throw apiError(403, 'You can\'t change your own access')
        if (Object.keys(body.sites).some(s => s !== local))
          throw apiError(403, `You can only give access to "${local}"`)
      }
      for (const [site, siteRole] of Object.entries(body.sites)) {
        if (!sites[site])
          throw apiError(422, `There's no site "${site}"`)
        if (siteRole === ADMIN_ROLE || siteRole === PUBLIC_ROLE || !await (await useAtelierRoles()).exists(siteRole))
          throw apiError(422, `"${siteRole}" can't be a role on a site`)
      }
      await store.set(id, body.sites)
      await audit(event, { action: 'user.updated', actorId: actor.id, target: { type: 'user', id }, details: { sites: body.sites } })
    }
    else if (method !== 'GET') {
      throw apiError(405, 'Method not allowed')
    }
    return store.of(id)
  }
  if (!id && method === 'GET') {
    const users = await auth.users.list()
    const shown = await Promise.all(users.map(manageable))
    return users.filter((_, i) => shown[i])
  }
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
