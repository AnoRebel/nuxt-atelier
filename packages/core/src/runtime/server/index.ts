// `#atelier/server`: the server-side public API
import type { AtelierDriver } from './db/driver'
import type { CollectionDefinition, SingletonDefinition } from './types'
import { createError, useRuntimeConfig } from 'nuxt/server'
import { connect } from './db/driver'
import { assertMigrated as assertMigratedWith } from './db/state'
import type { EntryStore } from './db/store'
import { ConflictError, createEntryStore, NotFoundError, ValidationError } from './db/store'
import { drivers } from '#atelier-drivers'

export * from './define'
export type { AtelierDriver, Dialect } from './db/driver'
export { createDatabaseAdapter, ForbiddenError } from './adapter'
export type { DatabaseAdapterOptions } from './adapter'
export { UnsupportedOperationError } from './db/driver'
export { ConflictError, NotFoundError, ValidationError, withTransaction } from './db/store'
export type { Entry, EntryStore, SaveInput } from './db/store'

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
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof NotFoundError)
    return createError({ status: error.statusCode, message: error.message, data: 'data' in error ? error.data : undefined })
  return error
}
