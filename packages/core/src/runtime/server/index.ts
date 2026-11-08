// `#atelier/server`: the server-side public API
import type { AtelierDriver } from './db/driver'
import type { TableSpec } from './db/tables'
import type { CollectionDefinition, SingletonDefinition } from './types'
import { useRuntimeConfig } from 'nuxt/server'
import { connect, UnsupportedOperationError } from './db/driver'
import { QueryError } from './db/query'
import { buildTables } from './db/tables'
import { assertMigrated as assertMigratedWith } from './db/state'
import type { EntryStore } from './db/store'
import { ConflictError, createEntryStore, NotFoundError, ReferencedError, ValidationError } from './db/store'
import { drivers } from '#atelier-drivers'
import type { RequestEvent } from 'nuxt/server'
import type { Capability, Policy } from '../shared/policy'
import type { AuthAdapter, AuthUser } from './auth/adapter'
import type { BuiltinAuthAdapter } from './auth/builtin'
import type { RoleStore } from './auth/roles'
import { createPolicy } from '../shared/policy'
import { defineAuthAdapter } from './auth/adapter'
import { createBuiltinAuth } from './auth/builtin'
import type { AuditInput, AuditLog } from './auth/audit'
import { createAuditLog } from './auth/audit'
import { clientIp, createRateLimiter } from './auth/rate-limit'
import { createRoleStore } from './auth/roles'
import { apiError } from './errors'

export * from './define'
export type { AtelierDriver, Dialect } from './db/driver'
export { createDatabaseAdapter, ForbiddenError } from './adapter'
export type { DatabaseAdapterOptions } from './adapter'
export { UnsupportedOperationError } from './db/driver'
export { QueryError } from './db/query'
export type { Condition, Filter, ListQuery, Operator } from './db/query'
export { apiError, readValid, validated } from './errors'
export type { ErrorCode } from './errors'
export { ConflictError, NotFoundError, ReferencedError, ValidationError, withTransaction } from './db/store'
export type { ColumnSpec, TableSpec } from './db/tables'
export type { Entry, EntryList, EntryStore, ListOptions, GetOptions, Reference, SaveInput } from './db/store'
export { defineAuthAdapter } from './auth/adapter'
export type { AuthAdapter, AuthUser, NewUser } from './auth/adapter'
export type { BuiltinAuthAdapter } from './auth/builtin'
export type { RoleEntry, RoleStore } from './auth/roles'
export type { AuditAction, AuditEntry, AuditInput, AuditLog } from './auth/audit'
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
  tables: Record<string, TableSpec>
}> {
  const { collections, singletons, tables } = await import('#atelier-schema')
  return { collections, singletons, tables }
}

/** Every table of the app as Drizzle tables, by table name: content, system and extra tables. */
export async function useAtelierTables(): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any -- tables differ per dialect
  return buildTables((await useAtelierDatabase()).dialect, await useAtelierSchema())
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
 * The API error for a store error, with its message (Nuxt hides the message of errors it didn't
 * create) and code: 409 `conflict` with `currentVersion`, 409 `referenced` with `references`, 422
 * `validation_failed` with field `errors`, 404, 400 `invalid_query`, 501 `unsupported`. Anything else
 * is returned unchanged.
 */
export function toHttpError(error: unknown): unknown {
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof ReferencedError)
    return apiError(error.statusCode, error.message, error.data, error instanceof ReferencedError ? 'referenced' : undefined)
  if (error instanceof NotFoundError)
    return apiError(404, error.message)
  if (error instanceof QueryError)
    return apiError(400, error.message, {}, 'invalid_query')
  if (error instanceof UnsupportedOperationError)
    return apiError(501, error.message)
  return error
}

/** The auth adapter in use. The built-in one adds sessions the CMS starts itself and a CSRF token. */
export type AtelierAuth = AuthAdapter & Partial<Pick<BuiltinAuthAdapter, 'startSession' | 'revokeSessions' | 'csrfToken'>>

let auth: Promise<AtelierAuth> | undefined
let customAuth: (() => AuthAdapter | Promise<AuthAdapter>) | undefined

/**
 * Replaces the built-in auth adapter, e.g. from a Nitro plugin:
 * `registerAuthAdapter(() => createMyAdapter())`. The factory runs on first use.
 */
export function registerAuthAdapter(factory: () => AuthAdapter | Promise<AuthAdapter>): void {
  customAuth = factory
  auth = undefined
}

/** The auth adapter: who's signed in, signing in and out, managing users. */
export function useAtelierAuth(): Promise<AtelierAuth> {
  auth ??= (async () => customAuth ? defineAuthAdapter(await customAuth()) : createBuiltinAuth(await useAtelierDatabase()))().catch((error) => {
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
    throw apiError(401, 'Sign in first')
  if (capability && !(await useAtelierPolicy()).can(user, 'manage', capability))
    throw apiError(403, `Your role can't manage ${capability}`)
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

let auditLog: Promise<AuditLog> | undefined

/** The audit log of security-relevant events. */
export function useAtelierAudit(): Promise<AuditLog> {
  auditLog ??= useAtelierDatabase().then(createAuditLog).catch((error) => {
    auditLog = undefined
    throw error
  })
  return auditLog
}

/** Records an audit event, with the IP of the request it came from. */
export async function audit(event: RequestEvent, input: AuditInput): Promise<void> {
  const { trustProxy } = useAtelierServerConfig().auth as { trustProxy: boolean }
  await (await useAtelierAudit()).record(input, clientIp(event, trustProxy))
}
