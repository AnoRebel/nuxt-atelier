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
import type { SettingsStore } from './settings'
import type { CollabStore } from './collab/store'
import type { SiteContext, SiteDefinition, SitesConfig } from './sites'
import type { ChallengeAdapter, SubmissionStore } from './forms'
import type { SiteRoleStore } from './site-roles'
import { ADMIN_ROLE, createPolicy } from '../shared/policy'
import { defineAuthAdapter } from './auth/adapter'
import { createBuiltinAuth } from './auth/builtin'
import type { AuditInput, AuditLog } from './auth/audit'
import { createAuditLog } from './auth/audit'
import { clientIp, createRateLimiter } from './auth/rate-limit'
import { createRoleStore } from './auth/roles'
import { createSettingsStore } from './settings'
import { createCollabStore } from './collab/store'
import { siteOf, singleSite } from './sites'
import { createSubmissionStore, turnstileChallenge } from './forms'
import { createSiteRoleStore } from './site-roles'
import { indexChange } from './search/service'
import { createTokenStore } from './auth/tokens'
import { apiError } from './errors'
import { logger } from './logger'

export * from './define'
export type { AtelierDriver, Dialect } from './db/driver'
export { createDatabaseAdapter, ForbiddenError } from './adapter'
export type { RobotsSettings, SettingKey, SettingsStore } from './settings'
export type { CollabStore, Comment, Lock, Notification, NotificationKind } from './collab/store'
export { turnstileChallenge } from './forms'
export { DEFAULT_SITE, singleSite } from './sites'
export type { SiteContext, SiteDefinition } from './sites'
export type { ChallengeAdapter, Submission, SubmissionStore } from './forms'
export { rebuildSearchIndex, registerSearchAdapter, searchSite, useAtelierSearch } from './search/service'
export type { SearchResult } from './search/service'
export type { SearchAdapter, SearchDocument, SearchHit, SearchQuery } from './search/adapter'
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
export { registerMailAdapter, sendMail, useAtelierMail } from './mail'
export type { MailAdapter, MailMessage } from './mail'
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
  /** Several sites are configured: site-scoped types and system tables carry a site. */
  sites: boolean
}> {
  const { collections, singletons, tables, blocks, locales } = await import('#atelier-schema')
  return { collections, singletons, tables, blocks, locales, sites: !!(useAtelierServerConfig() as unknown as { sites: SitesConfig }).sites.list }
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

const entryStores = new Map<string, Promise<EntryStore>>()

/**
 * Reads and saves entries of the app's collections, on the app's database, for one site: `useAtelierSite(event)`
 * in a request, `singleSite` without sites. Another site's entries read as missing.
 */
export function useAtelierEntries(site: SiteContext): Promise<EntryStore> {
  let entries = entryStores.get(site.name)
  entries ??= (async () => createEntryStore(await useAtelierDatabase(), await useAtelierSchema(), {
    site,
    siteLocales: siteLocales(site),
    maxNestingDepth: (useAtelierServerConfig() as unknown as { limits: { maxNestingDepth: number } }).limits.maxNestingDepth,
    onChange: (change) => {
      void contentChanged(change)
      void indexChange(change)
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
      entryStores.delete(site.name)
      throw error
    })
  entryStores.set(site.name, entries)
  return entries
}

const mediaLibraries = new Map<string, Promise<MediaLibrary>>()
let customStorage: (() => StorageDriver | Promise<StorageDriver>) | undefined

/**
 * Stores media with another driver than the local disk, from a storage package's server plugin:
 * `registerStorageDriver(() => createS3Driver(options))`. The factory runs on first use.
 */
export function registerStorageDriver(factory: () => StorageDriver | Promise<StorageDriver>): void {
  customStorage = factory
  mediaLibraries.clear()
  storageDriver = undefined
}

let storageDriver: Promise<StorageDriver> | undefined

/** Where files are kept: the media library's, and forms' private uploads (under `forms/`). */
export function useAtelierStorage(): Promise<StorageDriver> {
  storageDriver ??= (async () => {
    const config = useAtelierServerConfig() as unknown as { storage: { driver: string, dir: string } }
    if (config.storage.driver !== 'local' && !customStorage)
      throw new Error(`[nuxt-atelier] storage.driver is "${config.storage.driver}": add @nuxt-atelier/storage-${config.storage.driver} to your modules`)
    return customStorage ? customStorage() : createLocalDriver(config.storage.dir)
  })().catch((error) => {
    storageDriver = undefined
    throw error
  })
  return storageDriver
}

/** The media library: files in the configured storage, their metadata in the database; a site's own, and shared ones. */
export function useAtelierMedia(site: SiteContext): Promise<MediaLibrary> {
  let library = mediaLibraries.get(site.name)
  library ??= useAtelierDatabase().then(async (driver) => {
    const config = useAtelierServerConfig() as unknown as { media: { accept: string[] | string }, limits: { maxUploadSize: number } }
    const accept = typeof config.media.accept === 'string' ? JSON.parse(config.media.accept) as string[] : config.media.accept
    return createMediaLibrary(driver, await useAtelierStorage(), { maxUploadSize: config.limits.maxUploadSize, accept, site })
  }).catch((error) => {
    mediaLibraries.delete(site.name)
    throw error
  })
  mediaLibraries.set(site.name, library)
  return library
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
let collabStore: Promise<CollabStore> | undefined

let submissions: Promise<SubmissionStore> | undefined

/** Form submissions (forms.ts). */
export function useAtelierSubmissions(): Promise<SubmissionStore> {
  submissions ??= useAtelierDatabase().then(driver => createSubmissionStore(driver, useAtelierStorage)).catch((error) => {
    submissions = undefined
    throw error
  })
  return submissions
}

let challenge: (() => ChallengeAdapter | Promise<ChallengeAdapter>) | undefined

/** Verifies forms' submissions with your own challenge provider instead of Turnstile. Call it from a server plugin. */
export function registerChallengeAdapter(factory: () => ChallengeAdapter | Promise<ChallengeAdapter>): void {
  challenge = factory
}

/** The challenge forms ask for: yours, Turnstile when its keys are set, or none. */
export async function useAtelierChallenge(): Promise<ChallengeAdapter | undefined> {
  if (challenge)
    return challenge()
  const { turnstile } = (useAtelierServerConfig() as unknown as { forms: { turnstile: { siteKey: string, secret: string } } }).forms
  return turnstile.siteKey && turnstile.secret ? turnstileChallenge(turnstile) : undefined
}

/** The site a request is for (see sites.ts): what every site-scoped data access takes. */
export function useAtelierSite(event: RequestEvent): SiteContext {
  return siteOf(event, (useAtelierServerConfig() as unknown as { sites: SitesConfig }).sites)
}

/** A site's own locales and default locale, when it sets them. */
export function siteLocales(site: SiteContext): { codes?: string[], default?: string } {
  const definition = atelierSites()[site.name]
  return { ...definition?.locales && { codes: definition.locales }, ...(definition?.defaultLocale ?? definition?.locales?.[0]) && { default: definition?.defaultLocale ?? definition?.locales?.[0] } }
}

/** A request's site, or a site given as is. */
const siteFor = (scope: RequestEvent | SiteContext): SiteContext => 'scoped' in scope ? scope : useAtelierSite(scope)

/** Every site, for work that covers them all (rebuilding search, jobs): the one implicit site without `sites`. */
export function allSites(): SiteContext[] {
  const list = (useAtelierServerConfig() as unknown as { sites: SitesConfig }).sites.list
  return list ? Object.keys(list).map(name => ({ name, scoped: true })) : [singleSite]
}

/** The configured sites, by name (empty without `sites`). */
export function atelierSites(): Record<string, SiteDefinition> {
  return (useAtelierServerConfig() as unknown as { sites: SitesConfig }).sites.list ?? {}
}

let siteRoles: Promise<SiteRoleStore> | undefined

/** Users' roles per site (with `sites`; see site-roles.ts). */
export function useAtelierSiteRoles(): Promise<SiteRoleStore> {
  siteRoles ??= useAtelierDatabase().then(createSiteRoleStore).catch((error) => {
    siteRoles = undefined
    throw error
  })
  return siteRoles
}

/**
 * The user as they are on the request's site: with sites, their role there (administrators keep theirs
 * everywhere), or undefined when they have none, i.e. no access to it. Without sites, the user as is.
 */
export async function onSite(event: RequestEvent, user: AuthUser): Promise<AuthUser | undefined> {
  const site = useAtelierSite(event)
  if (!site.scoped || user.role === ADMIN_ROLE)
    return user
  const role = await (await useAtelierSiteRoles()).roleOn(user.id, site.name)
  return role ? { ...user, role } : undefined
}

/** Edit locks, presence, comments and notifications (collab/store.ts). */
export function useAtelierCollab(): Promise<CollabStore> {
  collabStore ??= (async () => {
    const lockTimeout = (useAtelierServerConfig() as unknown as { collaboration?: { lockTimeout?: number } }).collaboration?.lockTimeout ?? 60
    // someone is "here" while their 20-second heartbeats keep coming: a missed one or two is still here
    return createCollabStore(await useAtelierDatabase(), { lockTimeout, presenceTimeout: 50 })
  })().catch((error) => {
    collabStore = undefined
    throw error
  })
  return collabStore
}

const settingsStores = new Map<string, Promise<SettingsStore>>()

/** Site settings changed in the admin, over the module options (settings.ts). */
export function useAtelierSettings(site: SiteContext): Promise<SettingsStore> {
  let store = settingsStores.get(site.name)
  store ??= (async () => createSettingsStore(await useAtelierDatabase(), {
    robots: (useAtelierServerConfig() as unknown as { robots?: unknown }).robots ?? undefined,
  }, site))().catch((error) => {
    settingsStores.delete(site.name)
    throw error
  })
  settingsStores.set(site.name, store)
  return store
}

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
  const signedIn = await (await useAtelierAuth()).getUser(event)
  if (!signedIn)
    throw apiError(401, 'Sign in first')
  const user = await onSite(event, signedIn)
  if (!user)
    throw apiError(403, 'You don\'t have access to this site')
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

const tokenStores = new Map<string, Promise<ReturnType<typeof createTokenStore>>>()

/** API tokens of a site (with sites, each works only on the site it was made on). */
export function useAtelierTokens(site: SiteContext): Promise<ReturnType<typeof createTokenStore>> {
  let store = tokenStores.get(site.name)
  store ??= useAtelierDatabase().then(driver => createTokenStore(driver, site)).catch((error) => {
    tokenStores.delete(site.name)
    throw error
  })
  tokenStores.set(site.name, store)
  return store
}

/**
 * A page of a collection's entries, typed from its definition. Server code is trusted: no permission
 * checks (the API applies them). Page size and depth are capped by `limits`.
 */
export async function queryEntries<N extends CollectionName, Q extends CollectionQuery<N> = CollectionQuery<N>>(scope: RequestEvent | SiteContext, name: N, query?: Q): Promise<TypedEntryList<N, Q extends { depth: number } ? true : false>> {
  const { limits } = useAtelierServerConfig() as unknown as { limits: { maxPageSize: number, maxRelationDepth: number } }
  const limit = Math.min(query?.limit ?? 20, limits.maxPageSize)
  const page = await (await useAtelierEntries(siteFor(scope))).list(name, { ...query as ListQuery, limit, depth: Math.min(query?.depth ?? 0, limits.maxRelationDepth) })
  const data = (entry: Entry) => query?.fields ? Object.fromEntries(Object.entries(entry.data).filter(([key]) => (query.fields as string[]).includes(key))) : entry.data
  return { items: page.items.map(entry => ({ ...entry, data: data(entry) })) as never, total: page.total, limit, next: page.next }
}

/** One entry of a collection, typed from its definition, or undefined. No permission checks. */
export async function getEntry<N extends CollectionName, D extends number | undefined = undefined>(scope: RequestEvent | SiteContext, name: N, id: string, options?: { depth?: D, locale?: string }): Promise<TypedEntry<N, D extends number ? true : false> | undefined> {
  const { limits } = useAtelierServerConfig() as unknown as { limits: { maxRelationDepth: number } }
  return await (await useAtelierEntries(siteFor(scope))).get(name, id, { depth: Math.min(options?.depth ?? 0, limits.maxRelationDepth), locale: options?.locale }) as never
}
export type { CollectionFilter, CollectionName, CollectionQuery, Condition as FieldCondition, PopulatedEntry, RelatedEntry, SortKey, SystemField, TypedEntry, TypedEntryList } from '../shared/query'
