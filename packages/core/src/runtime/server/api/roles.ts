// Roles, for roles with the `roles` capability:
//   GET     /api/_atelier/roles  every role, with its source (builtin, code, database)
//   PUT     /api/_atelier/roles/<name>  creates or replaces a database role
//   DELETE  /api/_atelier/roles/<name>  deletes a database role no user has
// With sites, roles are shared by every site: only administrators change them.
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { assertMigrated, audit, requireUser, useAtelierAuth, useAtelierRoles, useAtelierSite } from '../index'
import { forgetCached } from '../cache'
import { apiError, readJson } from '../errors'

const PREFIX = '/api/_atelier/roles'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  const actor = await requireUser(event, 'roles')
  const roles = await useAtelierRoles()
  const name = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, ''))
  const method = event.req.method
  if (method !== 'GET' && useAtelierSite(event).scoped && actor.role !== ADMIN_ROLE)
    throw apiError(403, 'Roles are shared by every site: only an administrator can change them')

  if (!name && method === 'GET')
    return roles.list()
  if (name && method === 'PUT') {
    const before = (await roles.roles())[name] ?? null
    const saved = await roles.save(name, await readJson(event))
    forgetCached() // what visitors see follows the public role
    await audit(event, { action: 'role.saved', actorId: actor.id, target: { type: 'role', id: name }, details: { from: before, to: saved } })
    return saved
  }
  if (name && method === 'DELETE') {
    const inUse = (await (await useAtelierAuth()).users.list()).some(u => u.role === name)
    const before = (await roles.roles())[name] ?? null
    await roles.remove(name, inUse)
    forgetCached()
    await audit(event, { action: 'role.deleted', actorId: actor.id, target: { type: 'role', id: name }, details: { from: before } })
    return { ok: true }
  }
  throw apiError(405, 'Method not allowed')
})
