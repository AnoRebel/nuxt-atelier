import type { Field } from '../shared/fields'

/** How a routable collection's or singleton's entries get URLs: see the routing docs. */
export interface RouteDefinition {
  /**
   * The URL of each entry, with `{field}` for a required top-level field's value: `/blog/{slug}`. Or one
   * pattern per locale, the default locale first: `{ en: '/projects/{slug}', et: '/projektid/{slug}' }`.
   */
  pattern: string | Record<string, string>
  /**
   * Nested URLs: the key of a relation to the same collection holding the entry's parent. An entry's URL is
   * then its parent's URL followed by its own pattern, and moves with it: `/services` → `/services/design`.
   */
  parent?: string
  /** When an entry's URL changes, redirect its old URL to the new one (301). On by default. */
  redirects?: boolean
  /** A global component that renders the entry (it gets it as the `entry` prop); by default its blocks fields are rendered. */
  component?: string
  /** The layout its pages use (the app's default layout when omitted). */
  layout?: string
}

export interface CollectionDefinition {
  fields: Record<string, Field>
  /** The collection's previous name, when it was renamed: its entries move instead of being dropped. */
  renamedFrom?: string
  labels?: { singular?: string, plural?: string }
  /** Entries get URLs and are served by the site's catch-all page. */
  route?: RouteDefinition
  /** Entries have one version per locale. */
  localized?: boolean
  /**
   * Drafts and publishing: saves change a draft, and the site serves the version last published. Without
   * it, every save is published at once. Every type keeps a revision history either way.
   */
  versioned?: boolean
  admin?: { icon?: string, group?: string, columns?: string[] }
}

export interface SingletonDefinition {
  fields: Record<string, Field>
  label?: string
  /** The singleton gets a URL and is served by the site's catch-all page. */
  route?: RouteDefinition
  localized?: boolean
  /** Drafts and publishing, as for collections. */
  versioned?: boolean
  admin?: { icon?: string, group?: string }
}
