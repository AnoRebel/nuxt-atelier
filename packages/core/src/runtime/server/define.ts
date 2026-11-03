// Schema helpers with no Nuxt runtime imports: the migrate CLI loads definition files outside Nuxt,
// with `#atelier/server` aliased to this module.
import type { CollectionDefinition, SingletonDefinition } from './types'

export * from '../shared/fields'
export type { CollectionDefinition, SingletonDefinition } from './types'

/** Defines a collection. The file name under `server/atelier/collections/` is its name. */
export function defineCollection<const T extends CollectionDefinition>(definition: T): T {
  return definition
}

/** Defines a singleton. The file name under `server/atelier/singletons/` is its name. */
export function defineSingleton<const T extends SingletonDefinition>(definition: T): T {
  return definition
}
