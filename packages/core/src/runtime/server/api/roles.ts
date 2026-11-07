// Roles, for roles with the `roles` capability:
//   GET     /          every role, with its source (builtin, code, database)
//   PUT     /<name>    creates or replaces a database role
//   DELETE  /<name>    deletes a database role no user has
import { createError, defineEventHandler, getRequestURL, readBody } from 'nuxt/server'
import { assertMigrated, requireUser, useAtelierAuth, useAtelierRoles } from '../index'

const PREFIX = '/api/_atelier/roles'

export default defineEventHandler(async (event) => {
  await assertMigrated()
  await requireUser(event, 'roles')
  const roles = await useAtelierRoles()
  const name = decodeURIComponent(getRequestURL(event).pathname.slice(PREFIX.length).replace(/^\/|\/$/g, ''))
  const method = event.req.method

  if (!name && method === 'GET')
    return roles.list()
  if (name && method === 'PUT')
    return roles.save(name, await readBody(event))
  if (name && method === 'DELETE') {
    const inUse = (await (await useAtelierAuth()).users.list()).some(u => u.role === name)
    await roles.remove(name, inUse)
    return { ok: true }
  }
  throw createError({ status: 405, message: 'Method not allowed' })
})
