import type { Field } from '../shared/fields'

export interface CollectionDefinition {
  fields: Record<string, Field>
  /** The collection's previous name, when it was renamed: its entries move instead of being dropped. */
  renamedFrom?: string
  labels?: { singular?: string, plural?: string }
  /** Entries get URLs and appear in site routing. */
  routable?: boolean
  /** Entries have one version per locale. */
  localized?: boolean
  /** Keep a revision history. */
  versioned?: boolean
  admin?: { icon?: string, group?: string, columns?: string[] }
}

export interface SingletonDefinition {
  fields: Record<string, Field>
  label?: string
  localized?: boolean
  admin?: { icon?: string, group?: string }
}
