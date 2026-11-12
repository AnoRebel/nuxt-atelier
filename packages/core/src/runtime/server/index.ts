// `#atelier/server`: the server-side public API
import type { AtelierDriver } from './db/driver'
import type { TableSpec } from './db/tables'
import type { BlockSchema } from '../shared/blocks'
import type { Locales } from '../shared/locales'
import type { CollectionName, CollectionQuery, TypedEntry, TypedEntryList } from '../shared/query'
import type { ListQuery } from './db/query'
import type { CollectionDefinition, SingletonDefinition } from './types'
import { useRuntimeConfig, useServerHooks } from 'nuxt/server'
import type { JobQueue } from './jobs'
import type { MediaLibrary } from './media/library'
import type { StorageDriver } from './media/storage'
import type { WebhookStore } from './webhooks'
import { contentChanged } from './cache'
import { createJobQueue } from './jobs'
import { createMediaLibrary } from './media/library'
import { createLocalDriver } from './media/storage'
import { queueWebhooks } from './webhook-jobs'
import { createWebhookStore } from './webhooks'
import { connect, UnsupportedOperationError } from './db/driver'
import { QueryError } from './db/query'
import { buildTables } from './db/tables'
import { assertMigrated as assertMigratedWith } from './db/state'
import type { Entry, EntryStore } from './db/store'
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
import { createTokenStore } from './auth/tokens'
import { apiError } from './errors'
import { logger } from './logger'

export * from './define'
export type { AtelierDriver, Dialect } from './db/driver'
export { createDatabaseAdapter, ForbiddenError } from './adapter'
export type { DatabaseAdapterOptions } from './adapter'
export { UnsupportedOperationError } from './db/driver'
export { QueryError } from './db/query'
export type { Condition, Filter, ListQuery, Operator } from './db/query'
export { apiError, readValid, validated } from './errors'
export { openApiDocument } from './openapi'
export type { ContentChange } from './cache'
export type { MediaChanges, MediaItem, MediaLibrary } from './media/library'
export type { StorageDriver, StoredFile } from './media/storage'
export { defineJob } from './jobs'
export type { EnqueueOptions, Job, JobHandler, JobQueue, JobStatus, RunResult } from './jobs'
export { diffEntries } from '../shared/diff'
export type { Change } from '../shared/diff'
export { contentRepairs, findStaleContent } from '../shared/reconcile'
export type { StaleContent } from '../shared/reconcile'
export type { ErrorCode } from './errors'
export { ConflictError, NotFoundError, ReferencedError, ValidationError, withTransaction } from './db/store'
export type { ColumnSpec, TableSpec } from './db/tables'
export type { Entry, EntryList, EntryStore, GetOptions, LifecycleHook, LifecycleHooks, ListOptions, Reference, SaveInput } from './db/store'
export { defineAuthAdapter } from './auth/adapter'
export type { AuthAdapter, AuthUser, NewUser } from './auth/adapter'
export type { BuiltinAuthAdapter } from './auth/builtin'
export type { RoleEntry, RoleStore } from './auth/roles'
export type { TokenInfo, TokenStore } from './auth/tokens'
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
  blocks: Record<string, BlockSchema>
  locales: Locales
}> {
  const { collections, singletons, tables, blocks, locales } = await import('#atelier-schema')
  return { collections, singletons, tables, blocks, locales }
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
  entries ??= (async () => createEntryStore(await useAtelierDatabase(), await useAtelierSchema(), {
    maxNestingDepth: (useAtelierServerConfig() as unknown as { limits: { maxNestingDepth: number } }).limits.maxNestingDepth,
    onChange: (change) => {
      void contentChanged(change)
      queueWebhooks(change).catch((error: Error) => logger.error(`Couldn't queue webhooks for ${change.type} "${change.id}"`, { error }))
    },
    hooks: (hook, context) => (useServerHooks().callHook as (name: string, context: unknown) => unknown)(`atelier:${hook}`, context),
    onHookError: async (hook, context, error) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`The atelier:${hook} hook failed (the change it followed was kept)`, { error })
      const { type, id, actorId } = context as { type: string, id: string, actorId?: string | null }
      await (await useAtelierAudit()).record({ action: 'hook.failed', actorId: actorId ?? null, target: { type, id }, details: { hook: `atelier:${hook}`, error: message.slice(0, 1000) } })
    },
  }))()
    .catch((error) => {
      entries = undefined
      throw error
    })
  return entries
}

let mediaLibrary: Promise<MediaLibrary> | undefined
let customStorage: (() => StorageDriver | Promise<StorageDriver>) | undefined

/**
 * Stores media with another driver than the local disk, from a storage package's server plugin:
 * `registerStorageDriver(() => createS3Driver(options))`. The factory runs on first use.
 */
export function registerStorageDriver(factory: () => StorageDriver | Promise<StorageDriver>): void {
  customStorage = factory
  mediaLibrary = undefined
}

/** The media library: files in the configured storage, their metadata in the database. */
export function useAtelierMedia(): Promise<MediaLibrary> {
  mediaLibrary ??= useAtelierDatabase().then(async (driver) => {
    const config = useAtelierServerConfig() as unknown as { storage: { driver: string, dir: string }, media: { accept: string[] | string }, limits: { maxUploadSize: number } }
    const accept = typeof config.media.accept === 'string' ? JSON.parse(config.media.accept) as string[] : config.media.accept
    if (config.storage.driver !== 'local' && !customStorage)
      throw new Error(`[nuxt-atelier] storage.driver is "${config.storage.driver}": add @nuxt-atelier/storage-${config.storage.driver} to your modules`)
    const storage = customStorage ? await customStorage() : createLocalDriver(config.storage.dir)
    return createMediaLibrary(driver, storage, { maxUploadSize: config.limits.maxUploadSize, accept })
  }).catch((error) => {
    mediaLibrary = undefined
    throw error
  })
  return mediaLibrary
}

let webhookStore: Promise<WebhookStore> | undefined

/** Outgoing webhooks and their delivery log. */
export function useAtelierWebhooks(): Promise<WebhookStore> {
  webhookStore ??= useAtelierDatabase().then(createWebhookStore).catch((error) => {
    webhookStore = undefined
    throw error
  })
  return webhookStore
}

let jobQueue: Promise<JobQueue> | undefined

/** The background job queue on the app's database: enqueue jobs, run due ones. Handlers come from `defineJob()`. */
export function useAtelierJobs(): Promise<JobQueue> {
  jobQueue ??= useAtelierDatabase()
    .then(driver => createJobQueue(driver, { concurrency: (useAtelierServerConfig() as unknown as { limits: { jobConcurrency: number } }).limits.jobConcurrency }))
    .catch((error) => {
      jobQueue = undefined
      throw error
    })
  return jobQueue
}

/**
 * For shutdown: lets running jobs finish for up to `timeoutMs` (requeueing the rest, see JobQueue.stop),
 * then closes the database connection. Only what was opened: a server that never touched the database
 * doesn't connect to close it.
 */
export async function shutdownAtelier(timeoutMs = 10_000): Promise<void> {
  const queue = await jobQueue?.catch(() => undefined)
  if (queue) {
    const { requeued } = await queue.stop(timeoutMs)
    if (requeued)
      logger.warn(`Shutting down: ${requeued} running job${requeued === 1 ? '' : 's'} put back in the queue`)
  }
  const driver = await database?.catch(() => undefined)
  database = undefined
  await driver?.close()
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

let tokens: Promise<ReturnType<typeof createTokenStore>> | undefined

/** API tokens for headless clients. */
export function useAtelierTokens(): Promise<ReturnType<typeof createTokenStore>> {
  tokens ??= useAtelierDatabase().then(createTokenStore).catch((error) => {
    tokens = undefined
    throw error
  })
  return tokens
}

/**
 * A page of a collection's entries, typed from its definition. Server code is trusted: no permission
 * checks (the API applies them). Page size and depth are capped by `limits`.
 */
export async function queryEntries<N extends CollectionName, Q extends CollectionQuery<N> = CollectionQuery<N>>(name: N, query?: Q): Promise<TypedEntryList<N, Q extends { depth: number } ? true : false>> {
  const { limits } = useAtelierServerConfig() as unknown as { limits: { maxPageSize: number, maxRelationDepth: number } }
  const limit = Math.min(query?.limit ?? 20, limits.maxPageSize)
  const page = await (await useAtelierEntries()).list(name, { ...query as ListQuery, limit, depth: Math.min(query?.depth ?? 0, limits.maxRelationDepth) })
  const data = (entry: Entry) => query?.fields ? Object.fromEntries(Object.entries(entry.data).filter(([key]) => (query.fields as string[]).includes(key))) : entry.data
  return { items: page.items.map(entry => ({ ...entry, data: data(entry) })) as never, total: page.total, limit, next: page.next }
}

/** One entry of a collection, typed from its definition, or undefined. No permission checks. */
export async function getEntry<N extends CollectionName, D extends number | undefined = undefined>(name: N, id: string, options?: { depth?: D, locale?: string }): Promise<TypedEntry<N, D extends number ? true : false> | undefined> {
  const { limits } = useAtelierServerConfig() as unknown as { limits: { maxRelationDepth: number } }
  return await (await useAtelierEntries()).get(name, id, { depth: Math.min(options?.depth ?? 0, limits.maxRelationDepth), locale: options?.locale }) as never
}
export type { CollectionFilter, CollectionName, CollectionQuery, Condition as FieldCondition, PopulatedEntry, RelatedEntry, SortKey, SystemField, TypedEntry, TypedEntryList } from '../shared/query'
