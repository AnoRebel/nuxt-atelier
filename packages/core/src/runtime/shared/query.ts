// Query types for a collection, from its definition: filters, sorts and field selections only accept
// its fields (and the system fields), with values of the field's type.
import type { AtelierCollections, CollectionEntry } from './infer'

export type CollectionName = keyof AtelierCollections & string

/** Fields every entry has, usable in filters and sorts. */
export type SystemField = '_id' | '_createdAt' | '_updatedAt' | '_createdBy'

type Data<N extends CollectionName> = CollectionEntry<N>
type FieldName<N extends CollectionName> = keyof Data<N> & string
type Defs<N extends CollectionName> = AtelierCollections[N] extends { fields: infer F } ? F : never
type Element<T> = T extends readonly (infer E)[] ? E : T
type ValueOf<N extends CollectionName, K> = K extends FieldName<N> ? NonNullable<Data<N>[K]> : string

export interface Condition<V> {
  eq?: Element<V>
  ne?: Element<V>
  gt?: Element<V>
  gte?: Element<V>
  lt?: Element<V>
  lte?: Element<V>
  /** Text containing this (case-insensitive), or a list or relation holding it. */
  contains?: Element<V>
  in?: Element<V>[]
  /** true: empty; false: set. */
  null?: boolean
}

export type CollectionFilter<N extends CollectionName>
  = | { and: CollectionFilter<N>[] }
    | { or: CollectionFilter<N>[] }
    | { [K in FieldName<N> | SystemField]?: Condition<ValueOf<N, K>> }

export type SortKey<N extends CollectionName> = FieldName<N> | SystemField | `-${FieldName<N> | SystemField}`

export interface CollectionQuery<N extends CollectionName> {
  filter?: CollectionFilter<N>
  /** `['-publishedAt', 'title']`: descending with `-`. */
  sort?: SortKey<N>[]
  /** Only these fields of each entry's data. */
  fields?: FieldName<N>[]
  limit?: number
  offset?: number
  /** The `next` of the previous page. */
  cursor?: string
  /** Levels of relations to replace with the entries they point to. */
  depth?: number
  /** Localized collections: entries in this locale, missing fields filled from its fallback locales. */
  locale?: string
}

/** A related entry, as a populated relation holds it. */
export interface RelatedEntry {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  /** Routable types: the entry's URL (in the first locale of a per-locale pattern), or null. */
  path?: string | null
  /** Per-locale patterns: the entry's URL in each locale. */
  paths?: Record<string, string>
  /** The version the site serves, or null when unpublished. */
  publishedVersion: number | null
  data: Record<string, unknown>
}

type RelationKey<N extends CollectionName> = {
  [K in keyof Defs<N>]: Defs<N>[K] extends { type: 'relation', many: true } ? K : Defs<N>[K] extends { type: 'relation' } ? K : never
}[keyof Defs<N>] & FieldName<N>

/**
 * Entry data with populated relations: an entry, or its id when you can't read its collection.
 * Without `depth`, relations are ids (`CollectionEntry`).
 */
export type PopulatedEntry<N extends CollectionName> = Omit<Data<N>, RelationKey<N>> & {
  [K in RelationKey<N>]?: Defs<N>[K] extends { many: true } ? (RelatedEntry | string)[] : RelatedEntry | string | null
}

/** What a page needs to show a media item: where it's served, its size, and how to describe it. */
export interface MediaSummary {
  id: string
  url: string
  filename: string
  mime: string
  width: number | null
  height: number | null
  title: string | null
  alt: Record<string, string> | null
  caption: string | null
  credits: string | null
  focal: { x: number, y: number } | null
}

export interface TypedEntry<N extends CollectionName, Populated extends boolean = false> {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  /** Routable types: the entry's URL (in the first locale of a per-locale pattern), or null. */
  path?: string | null
  /** Per-locale patterns: the entry's URL in each locale. */
  paths?: Record<string, string>
  /** URLs of the entry that a page of the app serves instead, with that page's route path. */
  shadowed?: { path: string, page: string }[]
  /** The version the site serves, or null when unpublished; below `version` when the draft has unpublished changes. */
  publishedVersion: number | null
  /** The media items its fields use, by id: `entry.media[entry.data.cover]`. Absent when there are none. */
  media?: Record<string, MediaSummary>
  /** Localized collections: this version's locale. */
  locale?: string
  /** Localized collections: the ids of its translations (itself included), by locale. */
  translations?: Record<string, string>
  /** Read in a locale: the fields filled from another locale's version, with that locale. */
  fallbacks?: Record<string, string>
  data: Populated extends true ? PopulatedEntry<N> : Data<N>
}

export interface TypedEntryList<N extends CollectionName, Populated extends boolean = false> {
  items: TypedEntry<N, Populated>[]
  total: number
  /** The page size used: at most `limits.maxPageSize`. */
  limit: number
  /** The cursor for the next page, or null on the last. */
  next: string | null
}

/** The query string the list endpoint takes. */
export function toSearchParams(query: object = {}): Record<string, string> {
  const q = query as Record<string, unknown>
  const out: Record<string, string> = {}
  if (q.filter)
    out.filter = JSON.stringify(q.filter)
  if (Array.isArray(q.sort) && q.sort.length)
    out.sort = q.sort.join(',')
  if (Array.isArray(q.fields) && q.fields.length)
    out.fields = q.fields.join(',')
  for (const key of ['limit', 'offset', 'cursor', 'depth', 'locale'] as const) {
    if (q[key] !== undefined && q[key] !== null)
      out[key] = String(q[key])
  }
  return out
}
