// Roles from the database (edited in the admin) and from code (`server/atelier/roles.ts`, read-only,
// winning on a name clash). `admin` is built in and is neither.
import type { Role, Roles } from '../../shared/policy'
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import { createError } from 'nuxt/server'
import { ADMIN_ROLE } from '../../shared/policy'
import { buildTables } from '../db/tables'

const ACTIONS = ['create', 'read', 'update', 'delete', 'publish'] as const
const names = v.array(v.pipe(v.string(), v.maxLength(64)))

const RoleSchema = v.strictObject({
  label: v.optional(v.pipe(v.string(), v.maxLength(255))),
  capabilities: v.optional(v.array(v.picklist(['users', 'roles', 'settings', 'media']))),
  content: v.optional(v.record(v.pipe(v.string(), v.maxLength(64)), v.strictObject({
    actions: v.array(v.picklist(ACTIONS)),
    ownOnly: v.optional(v.array(v.picklist(ACTIONS))),
    hidden: v.optional(names),
    readOnly: v.optional(names),
  }))),
})

const ROLE_NAME = /^[a-z][a-z0-9-]{0,63}$/

/** The role a fresh install gets with its first administrator. */
export const EDITOR_ROLE: Role = {
  label: 'Editor',
  capabilities: ['media'],
  content: { '*': { actions: ['create', 'read', 'update', 'delete', 'publish'] } },
}

export interface RoleEntry {
  name: string
  role: Role
  /** `code` roles are defined in server/atelier/roles.ts and can't be edited here. */
  source: 'builtin' | 'code' | 'database'
}

export function createRoleStore(driver: AtelierDriver, codeRoles: Roles) {
  for (const [name, role] of Object.entries(codeRoles)) {
    if (name === ADMIN_ROLE || !ROLE_NAME.test(name))
      throw new Error(`[nuxt-atelier] server/atelier/roles.ts: "${name}" can't be a role name (lowercase letters, digits and "-"; "admin" is built in)`)
    const result = v.safeParse(RoleSchema, role)
    if (!result.success)
      throw new Error(`[nuxt-atelier] server/atelier/roles.ts: role "${name}": ${result.issues.map(i => `${v.getDotPath(i) ?? ''} ${i.message}`.trim()).join('; ')}`)
  }
  const { atelier_roles: table } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db

  const stored = async (): Promise<Record<string, Role>> =>
    Object.fromEntries((await db.select().from(table)).map((r: { name: string, definition: Role }) => [r.name, r.definition]))

  const editable = (name: string) => {
    if (name === ADMIN_ROLE)
      throw createError({ status: 409, message: 'The admin role is built in and can\'t be changed' })
    if (name in codeRoles)
      throw createError({ status: 409, message: `The role "${name}" is defined in server/atelier/roles.ts: change it there` })
  }

  return {
    /** Every role but `admin`, as the policy takes them. */
    async roles(): Promise<Roles> {
      return { ...await stored(), ...codeRoles }
    },

    async list(): Promise<RoleEntry[]> {
      const fromDb = await stored()
      return [
        { name: ADMIN_ROLE, role: { label: 'Administrator' }, source: 'builtin' as const },
        ...Object.entries(codeRoles).map(([name, role]) => ({ name, role, source: 'code' as const })),
        ...Object.entries(fromDb).filter(([name]) => !(name in codeRoles)).map(([name, role]) => ({ name, role, source: 'database' as const })),
      ]
    },

    async exists(name: string): Promise<boolean> {
      return name === ADMIN_ROLE || name in codeRoles || name in await stored()
    },

    /** Creates or replaces a database role. */
    async save(name: string, role: unknown): Promise<Role> {
      if (!ROLE_NAME.test(name))
        throw createError({ status: 400, message: 'A role name uses lowercase letters, digits and "-", starting with a letter' })
      editable(name)
      const result = v.safeParse(RoleSchema, role)
      if (!result.success)
        throw createError({ status: 422, message: 'Invalid role', data: { errors: result.issues.map(i => ({ path: v.getDotPath(i) ?? '', message: i.message })) } })
      const values = { definition: result.output, updatedAt: new Date().toISOString() }
      if (name in await stored())
        await db.update(table).set(values).where(eq(table.name, name))
      else
        await db.insert(table).values({ name, ...values })
      return result.output
    },

    /** Deletes a database role that no user has. */
    async remove(name: string, inUse: boolean): Promise<void> {
      editable(name)
      if (inUse)
        throw createError({ status: 409, message: `Users still have the role "${name}": give them another role first` })
      await db.delete(table).where(eq(table.name, name))
    },
  }
}

export type RoleStore = ReturnType<typeof createRoleStore>
