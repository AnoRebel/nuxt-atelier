// Schema helpers with no Nuxt runtime imports: the migrate CLI loads definition files outside Nuxt,
// with `#atelier/server` aliased to this module.
import type { Roles } from '../shared/policy'
import type { TableSpec } from './db/tables'
import type { CollectionDefinition, PatternDefinition, SingletonDefinition } from './types'

export * from '../shared/fields'
export type { CollectionDefinition, PatternDefinition, SingletonDefinition } from './types'

/** Defines a collection. The file name under `server/atelier/collections/` is its name. */
export function defineCollection<const T extends CollectionDefinition>(definition: T): T {
  return definition
}

/** Defines a singleton. The file name under `server/atelier/singletons/` is its name. */
export function defineSingleton<const T extends SingletonDefinition>(definition: T): T {
  return definition
}

/**
 * Defines roles in code (`server/atelier/roles.ts`): versioned with the app, read-only in the admin,
 * and replacing a database role of the same name.
 */
export function defineRoles<const T extends Roles>(roles: T): T {
  return roles
}

/** Extra tables (`server/atelier/tables.ts`), e.g. an auth adapter's: created and migrated like content tables. */
export function defineTables<const T extends Record<string, TableSpec>>(tables: T): T {
  return tables
}

/** Block arrangements editors insert as independent copies, by name: `server/atelier/patterns.ts`. */
export function definePatterns<const T extends Record<string, PatternDefinition>>(patterns: T): T {
  return patterns
}
