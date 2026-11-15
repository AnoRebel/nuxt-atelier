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
  /**
   * Structured data for its pages, as JSON-LD (https://schema.org), from the entry: runs on the server for
   * each page. `({ data, url, createdAt, updatedAt }) => ({ '@type': 'Article', headline: data.title, … })`.
   */
  jsonLd?: (entry: { data: Record<string, unknown>, url: string, createdAt?: string, updatedAt: string }) => Record<string, unknown> | Record<string, unknown>[] | undefined
}

export interface CollectionDefinition {
  fields: Record<string, Field>
  /** The collection's previous name, when it was renamed: its entries move instead of being dropped. */
  renamedFrom?: string
  labels?: { singular?: string, plural?: string }
  /** Entries get URLs and are served by the site's catch-all page. */
  route?: RouteDefinition
  /**
   * Entries have one version per locale (the `locales` module option), linked as translations. Mark fields
   * that aren't translated `shared`. `{ blocks: 'shared' }`: blocks fields keep one structure in every
   * locale (which blocks, their order, nesting and options), only their translated fields differ; by
   * default (`'independent'`) each locale has its own blocks.
   */
  localized?: boolean | { blocks?: 'independent' | 'shared' }
  /**
   * Drafts and publishing: saves change a draft, and the site serves the version last published. Without
   * it, every save is published at once. Every type keeps a revision history either way.
   */
  versioned?: boolean
  admin?: { icon?: string, group?: string, columns?: string[] }
  /** With several `sites`: entries belong to one site (the default), or every site shares them. */
  scope?: 'site' | 'shared'
  /**
   * Starting points for new entries, by name: field values (blocks get fresh ids on each use). Editors can
   * save more from existing entries.
   */
  templates?: Record<string, { label?: string, description?: string, data: Record<string, unknown> }>
}

/** A block arrangement editors insert as independent copies (`server/atelier/patterns.ts`). */
export interface PatternDefinition {
  label?: string
  description?: string
  blocks: { id: string, type: string, props: Record<string, unknown> }[]
}

export interface SingletonDefinition {
  fields: Record<string, Field>
  label?: string
  /** The singleton gets a URL and is served by the site's catch-all page. */
  route?: RouteDefinition
  /** A version per locale, as for collections: read and saved with a `locale`, shared fields kept the same in all. */
  localized?: boolean
  /** Drafts and publishing, as for collections. */
  versioned?: boolean
  admin?: { icon?: string, group?: string }
  /** With several `sites`: each site has its own (the default), or one is shared by every site. */
  scope?: 'site' | 'shared'
}
