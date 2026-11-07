// `#atelier/server`: the server-side public API
import type { AtelierDriver } from './db/driver'
import type { CollectionDefinition, SingletonDefinition } from './types'
import { createError, useRuntimeConfig } from 'nuxt/server'
import { connect } from './db/driver'
import { assertMigrated as assertMigratedWith } from './db/state'
import type { EntryStore } from './db/store'
import { ConflictError, createEntryStore, NotFoundError, ReferencedError, ValidationError } from './db/store'
import { drivers } from '#atelier-drivers'
import type { RequestEvent } from 'nuxt/server'
import type { Capability, Policy } from '../shared/policy'
import type { AuthUser } from './auth/adapter'
import type { BuiltinAuthAdapter } from './auth/builtin'
import type { RoleStore } from './auth/roles'
import { createPolicy } from '../shared/policy'
import { createBuiltinAuth } from './auth/builtin'
import { clientIp, createRateLimiter } from './auth/rate-limit'
import { createRoleStore } from './auth/roles'

export * from './define'
export type { AtelierDriver, Dialect } from './db/driver'
export { createDatabaseAdapter, ForbiddenError } from './adapter'
export type { DatabaseAdapterOptions } from './adapter'
export { UnsupportedOperationError } from './db/driver'
export { ConflictError, NotFoundError, ReferencedError, ValidationError, withTransaction } from './db/store'
export type { Entry, EntryStore, GetOptions, Reference, SaveInput } from './db/store'
export { defineAuthAdapter } from './auth/adapter'
export type { AuthAdapter, AuthUser, NewUser } from './auth/adapter'
export type { BuiltinAuthAdapter } from './auth/builtin'
export type { RoleEntry, RoleStore } from './auth/roles'
export { ADMIN_ROLE, createPolicy } from '../shared/policy'
export type { Capability, ContentAction, ContentPermission, FieldAccess, Policy, PolicyEntry, PolicyUser, Role, Roles } from '../shared/policy'

/** Private Nuxt Atelier runtime config (`runtimeConfig.atelier`), server only. */
export function useAtelierServerConfig() {
  return useRuntimeConfig().atelier
}

let database: Promise<AtelierDriver> | undefined

/** The database connection for `runtimeConfig.atelier.databaseUrl`, opened on first use and shared. */
export function useAtelierDatabase(): Promise<AtelierDriver> {
  const { databaseUrl, dbPoolSize } = useAtelierServerConfig()
  database ??= connect(databaseUrl, { loaders: drivers, poolSize: dbPoolSize }).catch((error) => {
    database = undefined // retry on the next call, e.g. once the database is up
    throw error
  })
  return database
}

/**
 * Every collection and singleton from the app and its layers, by name.
 * Loaded lazily: the definition files import helpers from this module, so a static import would be circular.
 */
export async function useAtelierSchema(): Promise<{
  collections: Record<string, CollectionDefinition>
  singletons: Record<string, SingletonDefinition>
}> {
  const { collections, singletons } = await import('#atelier-schema')
  return { collections, singletons }
}
export type { AtelierCollections, AtelierSingletons, BlockInstance, CollectionEntry, FieldValue, InferEntry, JsonValue, RichTextDocument, SingletonEntry } from '../shared/infer'

/** Throws a 503 while the production database has pending migrations. Call it before any CMS write. */
export function assertMigrated(): Promise<void> {
  return assertMigratedWith(useAtelierDatabase)
}

let entries: Promise<EntryStore> | undefined

/** Reads and saves entries of the app's collections, on the app's database. */
export function useAtelierEntries(): Promise<EntryStore> {
  entries ??= (async () => createEntryStore(await useAtelierDatabase(), await useAtelierSchema()))()
    .catch((error) => {
      entries = undefined
      throw error
    })
  return entries
}

/**
 * The HTTP error for a failed save: 409 with `currentVersion`, 422 with field `errors`, or 404, each with
 * its message (Nuxt hides the message of errors it didn't create). Anything else is returned unchanged.
 */
export function toHttpError(error: unknown): unknown {
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof NotFoundError || error instanceof ReferencedError)
    return createError({ status: error.statusCode, message: error.message, data: 'data' in error ? error.data : undefined })
  return error
}

let auth: Promise<BuiltinAuthAdapter> | undefined

/** The auth adapter (`atelier.auth.provider`): who's signed in, signing in and out, managing users. */
export function useAtelierAuth(): Promise<BuiltinAuthAdapter> {
  auth ??= useAtelierDatabase().then(driver => createBuiltinAuth(driver)).catch((error) => {
    auth = undefined
    throw error
  })
  return auth
}

let roleStore: Promise<RoleStore> | undefined

/** Roles from the database and from `server/atelier/roles.ts`. */
export function useAtelierRoles(): Promise<RoleStore> {
  roleStore ??= (async () => createRoleStore(await useAtelierDatabase(), (await import('#atelier-schema')).roles))()
    .catch((error) => {
      roleStore = undefined
      throw error
    })
  return roleStore
}

/** The permission policy for the current roles. Rebuilt per call, so role edits apply at once. */
export async function useAtelierPolicy(): Promise<Policy> {
  return createPolicy(await (await useAtelierRoles()).roles())
}

/** The signed-in user, or a 401. With a capability, a 403 unless the user's role has it. */
export async function requireUser(event: RequestEvent, capability?: Capability): Promise<AuthUser> {
  const user = await (await useAtelierAuth()).getUser(event)
  if (!user)
    throw createError({ status: 401, message: 'Sign in first' })
  if (capability && !(await useAtelierPolicy()).can(user, 'manage', capability))
    throw createError({ status: 403, message: `Your role can't manage ${capability}` })
  return user
}

let limiter: Promise<ReturnType<typeof createRateLimiter>> | undefined

/** Database-backed rate limits, shared by every server instance. */
export function useAtelierRateLimiter(): Promise<ReturnType<typeof createRateLimiter>> {
  limiter ??= useAtelierDatabase().then(createRateLimiter).catch((error) => {
    limiter = undefined
    throw error
  })
  return limiter
}

/** The limits on sign-in attempts from this request's IP, for an email when given. */
export function signInLimits(event: RequestEvent, email?: string) {
  const { signInAttempts: attempts, signInWindow: window, trustProxy } = useAtelierServerConfig().auth as { signInAttempts: number, signInWindow: number, trustProxy: boolean }
  const ip = clientIp(event, trustProxy)
  return email === undefined
    ? [{ key: `sign-in:${ip}`, max: attempts * 5, window }]
    : [{ key: `sign-in:${ip}:${email}`, max: attempts, window }, { key: `sign-in:${email}`, max: attempts * 5, window }]
}
