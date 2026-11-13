// What the admin builds itself from: the content types the caller may read, with their fields (validators
// left out, fields the caller can't read removed), what the caller may do with each, the blocks, the
// locales and the admin areas the caller manages (with the role names, to those who manage users or roles).
//   GET /api/_atelier/schema
import type { Capability, ContentAction } from '../../shared/policy'
import { defineEventHandler } from 'nuxt/server'
import { serialiseFields } from '../../shared/fields'
import { caller } from '../content-access'
import { apiError } from '../errors'
import { useAtelierRoles, useAtelierSchema } from '../index'

const ACTIONS: ContentAction[] = ['create', 'read', 'update', 'delete', 'publish', 'comment']
const CAPABILITIES: Capability[] = ['users', 'roles', 'settings', 'media', 'redirects', 'forms']
const json = (value: unknown) => JSON.parse(serialiseFields(value)) // functions and Standard Schemas dropped

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET')
    throw apiError(405, 'Method not allowed')
  const who = await caller(event)
  const { collections, singletons, blocks, locales } = await useAtelierSchema()
  const { principal: user, policy } = who

  const type = (name: string, definition: { fields: Record<string, unknown>, route?: unknown, localized?: unknown, versioned?: boolean, admin?: unknown }) => {
    const { hidden, readOnly } = policy.fields(user, name)
    return {
      name,
      fields: json(Object.fromEntries(Object.entries(definition.fields).filter(([key]) => !hidden.has(key)))),
      readOnly: [...readOnly],
      can: Object.fromEntries(ACTIONS.map(action => [action, policy.can(user, action, name)])) as Record<ContentAction, boolean>,
      ownOnly: ACTIONS.filter(action => policy.ownOnly(user, action, name)),
      routable: definition.route !== undefined,
      localized: Boolean(definition.localized),
      versioned: definition.versioned === true,
      ...definition.admin ? { admin: json(definition.admin) } : {},
    }
  }

  const capabilities = CAPABILITIES.filter(capability => policy.can(user, 'manage', capability))
  // the roles a user can be given, for those who manage users or roles
  const roles = capabilities.includes('users') || capabilities.includes('roles')
    ? (await (await useAtelierRoles()).list()).filter(r => r.name !== 'public').map(r => ({ name: r.name, ...r.role.label ? { label: r.role.label } : {} }))
    : undefined

  return {
    user: { id: user.id, role: user.role },
    capabilities,
    ...roles ? { roles } : {},
    locales,
    collections: Object.entries(collections)
      .filter(([name]) => policy.can(user, 'read', name))
      .map(([name, definition]) => ({ ...type(name, definition), ...definition.labels ? { labels: definition.labels } : {} })),
    singletons: Object.entries(singletons)
      .filter(([name]) => policy.can(user, 'read', name))
      .map(([name, definition]) => ({ ...type(name, definition), ...definition.label ? { label: definition.label } : {} })),
    blocks: json(blocks),
  }
})
