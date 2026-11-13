// What the admin builds itself from: the content types the caller may read, with their fields (validators
// left out, fields the caller can't read removed), what the caller may do with each, the blocks, the
// locales and the admin areas the caller manages (with the role names, to those who manage users or roles).
//   GET /api/_atelier/schema
import type { Capability, ContentAction } from '../../shared/policy'
import { defineEventHandler } from 'nuxt/server'
import { serialiseFields } from '../../shared/fields'
import { caller } from '../content-access'
import { apiError } from '../errors'
import { ADMIN_ROLE } from '../../shared/policy'
import { atelierSites, siteLocales, useAtelierAuth, useAtelierRoles, useAtelierSchema, useAtelierSiteRoles } from '../index'

const ACTIONS: ContentAction[] = ['create', 'read', 'update', 'delete', 'publish', 'comment']
const CAPABILITIES: Capability[] = ['users', 'roles', 'settings', 'media', 'redirects', 'forms']
const json = (value: unknown) => JSON.parse(serialiseFields(value)) // functions and Standard Schemas dropped

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'GET')
    throw apiError(405, 'Method not allowed')
  const who = await caller(event)
  const schema = await useAtelierSchema()
  const { collections, singletons, blocks } = schema
  // the site's own locales, when it has them
  const own = siteLocales(who.site)
  const locales = { ...schema.locales, ...own.codes && { codes: own.codes }, ...own.default && { default: own.default } }
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

  // with sites: this one, and the ones the user may switch to (administrators: all)
  const configured = atelierSites()
  const signedIn = who.site.scoped && user.id ? await (await useAtelierAuth()).getUser(event) : null
  const reachable = !signedIn
    ? []
    : signedIn.role === ADMIN_ROLE ? Object.keys(configured) : Object.keys(await (await useAtelierSiteRoles()).of(signedIn.id))
  return {
    user: { id: user.id, role: user.role },
    ...who.site.scoped ? { site: who.site.name, sites: reachable.map(name => ({ name, label: configured[name]?.label ?? name })) } : {},
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
