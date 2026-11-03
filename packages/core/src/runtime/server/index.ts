// `#atelier/server`: the server-side public API
import type { AtelierDriver } from './db/driver'
import type { CollectionDefinition, SingletonDefinition } from './types'
import { useRuntimeConfig } from 'nuxt/server'
import { connect } from './db/driver'

export * from '../shared/fields'
export type { AtelierDriver, Dialect } from './db/driver'
export type { CollectionDefinition, SingletonDefinition } from './types'

/** Private Nuxt Atelier runtime config (`runtimeConfig.atelier`), server only. */
export function useAtelierServerConfig() {
  return useRuntimeConfig().atelier
}

let database: Promise<AtelierDriver> | undefined

/** The database connection for `runtimeConfig.atelier.databaseUrl`, opened on first use and shared. */
export function useAtelierDatabase(): Promise<AtelierDriver> {
  const { databaseUrl, dbPoolSize } = useAtelierServerConfig()
  database ??= connect(databaseUrl, { poolSize: dbPoolSize }).catch((error) => {
    database = undefined // retry on the next call, e.g. once the database is up
    throw error
  })
  return database
}

/** Defines a collection. The file name under `server/atelier/collections/` is its name. */
export function defineCollection<const T extends CollectionDefinition>(definition: T): T {
  return definition
}

/** Defines a singleton. The file name under `server/atelier/singletons/` is its name. */
export function defineSingleton<const T extends SingletonDefinition>(definition: T): T {
  return definition
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
