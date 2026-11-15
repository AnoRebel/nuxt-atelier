// Entry reads and saves. A save writes the entry row, its relation rows and a revision snapshot in one
// transaction: all of it persists or none does. Writes carry the version the client last read; a write
// against an older version is refused with a 409 rather than overwriting someone else's save.
import type { BlockSchema } from '../../shared/blocks'
import type { BlockInstance } from '../../shared/infer'
import type { Field, FieldError, RelationField } from '../../shared/fields'
import type { Redirect } from '../redirects'
import type { EntryPath } from '../routes'
import type { CollectionDefinition, RouteDefinition } from '../types'
import type { AtelierDriver } from './driver'
import type { Db } from './entries'
import type { ContentSchema, Stage } from './tables'
import type { ListQuery } from './query'
import { and, asc, eq, inArray, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import { collapseShared, copyBlocks, replaceShared, resolveShared, SHARED_BLOCK, SHARED_BLOCKS, sharedRefs } from '../../shared/blocks'
import { validateEntry } from '../../shared/fields'
import { fallbackChain, resolveLocales } from '../../shared/locales'
import { REDIRECT_STATUSES, redirectLoop, sourceProblem, targetProblem } from '../redirects'
import { entryPaths, MAX_PATH, patterns, presentPaths } from '../routes'
import { deadlocked, UnsupportedOperationError } from './driver'
import { fromRow, isEmpty, isUnique, toRow } from './entries'
import { afterCursor, compileFilter, compileSort, decodeCursor, encodeCursor, orderBy } from './query'
import { buildTables, collectionTable, published, siteScoped } from './tables'
import { singleSite } from '../sites'
import type { SiteContext } from '../sites'

/** The entry changed since the client read it. `currentVersion` is the version to reload. */
export class ConflictError extends Error {
  readonly statusCode = 409
  readonly data: { currentVersion: number }
  constructor(readonly currentVersion: number) {
    super(`The entry was changed by someone else: it's at version ${currentVersion}. Reload it and apply your changes again.`)
    this.data = { currentVersion }
  }
}

/** The data doesn't pass the collection's validation. */
export class ValidationError extends Error {
  readonly statusCode = 422
  readonly data: { errors: FieldError[] }
  constructor(readonly errors: FieldError[]) {
    super(`Invalid entry: ${errors.map(e => `${e.path}: ${e.message}`).join('; ')}`)
    this.data = { errors }
  }
}

/** No entry (or singleton) with that id: the API answers 404. */
export class NotFoundError extends Error {
  readonly statusCode = 404
}

/** An entry that references the one being deleted, through a relation field that restricts deletes. */
export interface Reference { collection: string, id: string, field: string }

/** The entry can't be deleted while `references` point to it. */
export class ReferencedError extends Error {
  readonly statusCode = 409
  readonly data: { references: Reference[] }
  constructor(what: string, readonly references: Reference[], hint = 'Remove those references first, or set onDelete on the relation field.') {
    super(`Can't delete ${what}: it's referenced by ${references.map(r => `${r.collection} "${r.id}" (${r.field})`).join(', ')}. ${hint}`)
    this.data = { references }
  }
}

export interface GetOptions {
  /** How many levels of relations to replace with the entries they point to. 0 (the default) keeps ids. */
  depth?: number
  /** What the site serves (the default), or the drafts editors work on. */
  stage?: Stage
  /**
   * Localized collections: the version in this locale. Missing, the first of its fallback locales that
   * has one; translated fields left empty are filled from the next ones (see `Entry.fallbacks`).
   */
  locale?: string
  /** Localized singletons: false reads only `locale`'s own version, without fallbacks (what editing needs). */
  fallback?: boolean
}

export interface Entry {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  /** The user who created it, when known. */
  createdBy: string | null
  /** Routable collections: the entry's URL (in the first locale of a per-locale pattern), or null. */
  path?: string | null
  /** Per-locale patterns: the entry's URL in each locale. */
  paths?: Record<string, string>
  /** The version the site serves, or null when it isn't published. Below `version`: unpublished changes. */
  publishedVersion: number | null
  /** Localized collections: this version's locale. */
  locale?: string
  /** Localized collections: the ids of its translations (itself included), by locale. */
  translations?: Record<string, string>
  /** Read in a locale: the fields filled from another locale's version, with that locale. */
  fallbacks?: Record<string, string>
  data: Record<string, unknown>
}

/** What a site path resolves to. */
export interface ResolvedRoute {
  /** The canonical path, and the locale of its pattern ('' when shared by every locale). */
  path: string
  locale: string
  kind: 'collection' | 'singleton'
  /** The collection or singleton. */
  name: string
  /** The entry id; a singleton's name. */
  id: string
}

export interface ListOptions extends ListQuery {
  /** Levels of relations to replace with the entries they point to. */
  depth?: number
  /** What the site serves (the default), or the drafts editors work on. */
  stage?: Stage
  /** Only entries this user created (own-entries-only permissions). */
  createdBy?: string
  /**
   * Localized collections: the entries in this locale (the default locale when omitted). Given, their empty
   * translated fields are filled from the fallback locales, as for `get`.
   */
  locale?: string
}

export interface EntryList {
  items: Entry[]
  /** Entries matching the filter, on every page. */
  total: number
  /** The cursor for the next page, or null on the last one. */
  next: string | null
}

export interface SingletonEntry {
  name: string
  version: number
  updatedAt: string
  /** Routable singletons: its URL, as for entries. */
  path?: string | null
  paths?: Record<string, string>
  /** As for entries. */
  publishedVersion: number | null
  /** Localized singletons: this version's locale. */
  locale?: string
  /** Read in a locale: the fields filled from another locale's version, with that locale (as for entries). */
  fallbacks?: Record<string, string>
  data: Record<string, unknown>
}

export interface SaveInput {
  /** Omit to create an entry. */
  id?: string
  data: Record<string, unknown>
  /** Required when updating: the version the client last read. */
  version?: number
  authorId?: string
  /** Publish the saved version too. Types that aren't `versioned` always do. */
  publish?: boolean
  /** Creating in a localized collection: the new version's locale (the default locale when omitted). */
  locale?: string
  /** Creating in a localized collection: an entry this one translates, linking the two. */
  translationOf?: string
}

interface RelationRow { field: string, position: number, target: string, targetId: string }

/** The relations-table target of media usage rows: where each media item is used. */
export const MEDIA_TARGET = 'atelier:media'

/**
 * Media ids anywhere in the entry, under their dot path (`content.0.props.image`): media fields, in objects,
 * repeaters and blocks (by each block type's fields and options, and in its areas).
 */
function mediaRows(fields: Record<string, Field>, data: Record<string, unknown> | undefined, blocks: Record<string, BlockSchema> | undefined, prefix = ''): RelationRow[] {
  const rows: RelationRow[] = []
  const inBlocks = (list: unknown, path: string) => {
    if (!Array.isArray(list))
      return
    list.forEach((block: { type?: string, props?: Record<string, unknown> }, i) => {
      const schema = block?.type ? blocks?.[block.type] : undefined
      if (!schema || !block.props)
        return
      rows.push(...mediaRows({ ...schema.fields, ...schema.options }, block.props, blocks, `${path}.${i}.props.`))
      for (const area of Object.keys(schema.areas))
        inBlocks(block.props[area], `${path}.${i}.props.${area}`)
    })
  }
  for (const [key, field] of Object.entries(fields)) {
    const value = data?.[key]
    if (field.type === 'media' && typeof value === 'string' && value)
      rows.push({ field: `${prefix}${key}`, position: 0, target: MEDIA_TARGET, targetId: value })
    else if (field.type === 'object' && value && typeof value === 'object')
      rows.push(...mediaRows(field.fields, value as Record<string, unknown>, blocks, `${prefix}${key}.`))
    else if (field.type === 'repeater' && Array.isArray(value))
      value.forEach((item, i) => rows.push(...mediaRows(field.fields, item, blocks, `${prefix}${key}.${i}.`)))
    else if (field.type === 'blocks')
      inBlocks(value, `${prefix}${key}`)
  }
  return rows
}

/** The ids of the media items an entry's data uses, anywhere in it (see mediaRows). */
export const mediaIds = (fields: Record<string, Field>, data: Record<string, unknown>, blocks?: Record<string, BlockSchema>) =>
  [...new Set(mediaRows(fields, data, blocks).map(row => row.targetId))]

/**
 * References to shared blocks anywhere in the entry, under their block's path (`content.3`): relation rows
 * targeting the shared blocks collection, so deleting one in use is refused like a restricting relation.
 */
function sharedRows(data: unknown, prefix = ''): RelationRow[] {
  if (Array.isArray(data))
    return data.flatMap((item, i) => sharedRows(item, `${prefix}${i}.`))
  if (!data || typeof data !== 'object')
    return []
  const node = data as { type?: unknown, props?: { ref?: unknown } }
  if (node.type === SHARED_BLOCK && typeof node.props?.ref === 'string')
    return [{ field: prefix.slice(0, -1), position: 0, target: SHARED_BLOCKS, targetId: node.props.ref }]
  return Object.entries(data).flatMap(([key, item]) => sharedRows(item, `${prefix}${key}.`))
}

/** Relation values anywhere in the entry, nested ones under their dot path (`faq.2.author`). */
function relationRows(fields: Record<string, Field>, data: Record<string, unknown> | undefined, prefix = ''): RelationRow[] {
  const rows: RelationRow[] = []
  for (const [key, field] of Object.entries(fields)) {
    const value = data?.[key]
    if (field.type === 'relation') {
      const ids = Array.isArray(value) ? value : value ? [value] : []
      ids.forEach((id, position) => rows.push({ field: `${prefix}${key}`, position, target: field.to, targetId: String(id) }))
    }
    else if (field.type === 'object' && value && typeof value === 'object') {
      rows.push(...relationRows(field.fields, value as Record<string, unknown>, `${prefix}${key}.`))
    }
    else if (field.type === 'repeater' && Array.isArray(value)) {
      value.forEach((item, i) => rows.push(...relationRows(field.fields, item, `${prefix}${key}.${i}.`)))
    }
  }
  return rows
}

/** A copy of `data` with references to `removed` entries (`<collection>:<id>`) taken out, at any depth. */
function withoutRefs(fields: Record<string, Field>, data: Record<string, unknown>, removed: Set<string>): Record<string, unknown> {
  const out = { ...data }
  for (const [key, field] of Object.entries(fields)) {
    const value = data[key]
    const gone = (id: unknown) => removed.has(`${(field as RelationField).to}:${id}`)
    if (field.type === 'relation')
      out[key] = Array.isArray(value) ? value.filter(id => !gone(id)) : gone(value) ? null : value
    else if (field.type === 'object' && value && typeof value === 'object')
      out[key] = withoutRefs(field.fields, value as Record<string, unknown>, removed)
    else if (field.type === 'repeater' && Array.isArray(value))
      out[key] = value.map(item => withoutRefs(field.fields, item, removed))
  }
  return out
}

interface Block { id: string, type: string, props?: Record<string, unknown> }
const isBlockList = (x: unknown): x is Block[] => Array.isArray(x) && x.every(b => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.type === 'string')

/**
 * Shared block structure: `source`'s blocks (which, their order, nesting and options), each keeping the
 * translated fields of the block with its id in `translation` (anywhere in it: a moved block keeps its
 * text). A block new to the translation has the source's text, to be translated. Fields marked `shared`
 * follow the source too.
 */
function sameStructure(source: unknown, translation: unknown, blocks: Record<string, BlockSchema>): Block[] | null {
  if (!isBlockList(source))
    return null
  const own = new Map<string, Block>()
  const collect = (list: unknown) => {
    if (!isBlockList(list))
      return
    for (const block of list) {
      own.set(block.id, block)
      for (const area of Object.keys(blocks[block.type]?.areas ?? {}))
        collect(block.props?.[area])
    }
  }
  collect(translation)
  const build = (list: Block[]): Block[] => list.map((block) => {
    const schema = blocks[block.type]
    const mine = own.get(block.id)
    const props: Record<string, unknown> = { ...block.props }
    for (const [key, field] of Object.entries(schema?.fields ?? {})) {
      if (!field.shared && mine?.type === block.type && mine.props && key in mine.props)
        props[key] = mine.props[key]
    }
    for (const area of Object.keys(schema?.areas ?? {}))
      props[area] = isBlockList(block.props?.[area]) ? build(block.props[area] as Block[]) : block.props?.[area]
    return { ...block, props }
  })
  return build(source)
}

/** Data saved under a field's previous key reads under its new one. */
function renamed(fields: Record<string, Field>, data: Record<string, unknown>): Record<string, unknown> {
  const from = new Map(Object.entries(fields).flatMap(([key, f]) => f.renamedFrom === undefined ? [] : [[f.renamedFrom, key]]))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const to = from.get(key) ?? key
    out[to] ??= value
  }
  return out
}

const entryKey = (source: string, sourceId: string) => `${source}:${sourceId}`

/** Runs `fn` again (up to 4 times, after a short random wait) when the database reports a deadlock. */
async function retryingDeadlocks<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    }
    catch (error) {
      if (attempt >= 4 || !deadlocked(error))
        throw error
      await new Promise(resolve => setTimeout(resolve, Math.random() * 25 * attempt))
    }
  }
}

/** Rows a statement changed, whatever the driver's result shape. */
export function affected(result: unknown): number {
  const r = (Array.isArray(result) ? result[0] : result) as { rowsAffected?: number, rowCount?: number, affectedRows?: number, meta?: { changes?: number } }
  return r.rowsAffected ?? r.rowCount ?? r.affectedRows ?? r.meta?.changes ?? 0 // libSQL, pg, mysql2, D1
}

/**
 * Runs `fn` in a transaction. Where the database has none (Cloudflare D1) it throws
 * UnsupportedOperationError naming the operation, before changing anything.
 */
export async function withTransaction<T>(driver: AtelierDriver, operation: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!driver.capabilities.transactions)
    throw new UnsupportedOperationError(`[nuxt-atelier] ${operation} needs a multi-statement transaction, which Cloudflare D1 doesn't support. Nothing was changed.`)
  return (driver.db as Db).transaction(fn)
}

interface Target<T> {
  what: string // for messages: `entry "<id>" in "articles"`
  fields: Record<string, Field>
  source: string
  sourceId: string
  /** A localized entry's locale: given when creating, else looked up when needed. */
  locale?: string
  /** Creating a translation: the group of the entry it translates. */
  group?: string
  /** The version the client read; undefined creates. */
  expected: number | undefined
  authorId: string | undefined
  /** `publishing` checks the published entries too: a value can be a draft's and still live elsewhere. */
  isUnique?: (q: Db, publishing: boolean) => (field: string, value: unknown) => Promise<boolean>
  currentVersion: (q: Db) => Promise<number | undefined>
  /** The insert, or the update guarded by the expected version. */
  write: (q: Db, data: Record<string, unknown>, version: number, now: string) => unknown
  /** Copies the row as just written to the published table, or (`remove`) deletes its published copy. */
  publish: (q: Db, remove?: boolean) => unknown[]
  read: (q: Db) => Promise<T>
}

/** A committed write: `live` when what the site serves changed. */
export interface StoreChange { type: string, id: string, action: 'saved' | 'published' | 'unpublished' | 'deleted', live: boolean, site: SiteContext }

/** Who did it: a user or API token id, when known. */
interface Acting { type: string, id: string, actorId: string | null }

/**
 * What each lifecycle hook gets. Before-hooks run first and may change `data` (create, update) or throw to
 * stop the operation; the error reaches the caller. After-hooks run once it's committed; a failing one is
 * reported, never undoing the write. `type` is a collection or singleton, `id` an entry id or a
 * singleton's name.
 */
export interface LifecycleHooks {
  beforeCreate: Acting & { data: Record<string, unknown>, publish: boolean }
  afterCreate: Acting & { entry: Entry | SingletonEntry }
  beforeUpdate: Acting & { data: Record<string, unknown>, version: number, publish: boolean }
  afterUpdate: Acting & { entry: Entry | SingletonEntry }
  beforeDelete: Acting
  afterDelete: Acting
  /** `version`: the version being published (for a scheduled publish, the pinned one). */
  beforePublish: Acting & { version: number }
  afterPublish: Acting & { version: number }
  beforeUnpublish: Acting
  afterUnpublish: Acting
  /** `id` for a single entry, `query` for a list. */
  beforeRead: { type: string, id?: string, query?: ListOptions, stage: Stage }
  /** The entries read: change them in place (e.g. add or hide values). */
  afterRead: { type: string, stage: Stage, entries: (Entry | SingletonEntry)[] }
}
export type LifecycleHook = keyof LifecycleHooks

export interface StoreOptions {
  maxNestingDepth?: number
  onChange?: (change: StoreChange) => unknown
  /** Runs a lifecycle hook: `atelier:<hook>` in a Nuxt app. */
  hooks?: <H extends LifecycleHook>(hook: H, context: LifecycleHooks[H]) => unknown
  /** An after-hook failed: the write stands. Logged when not given. */
  onHookError?: (hook: LifecycleHook, context: unknown, error: unknown) => unknown
  /** The site every read and write is for (with `sites`); the implicit single site otherwise. */
  site?: SiteContext
  /** The site's own locales and default (`sites.<name>.locales`, `defaultLocale`), when it has them. */
  siteLocales?: { codes?: string[], default?: string }
}

export function createEntryStore(driver: AtelierDriver, schema: ContentSchema, options: StoreOptions = {}) {
  const tables = buildTables(driver.dialect, schema)
  const db = driver.db as Db
  const { atelier_redirects: redirectsTable, atelier_revisions: revisions } = tables
  // the site this store reads and writes: site-scoped rows carry it, shared ones '' (singletons, routes)
  const site = options.site ?? singleSite
  const scopedType = (name: string) => siteScoped(schema, schema.collections[name] ?? schema.singletons[name])
  /** The site a type's singleton and route rows carry: this store's, or '' for a shared type. */
  const siteOfType = (name: string) => scopedType(name) ? site.name : ''
  /** The condition keeping a collection table's rows to this site (none for a shared type, or without sites). */
  const inSite = (name: string, table: Db) => scopedType(name) ? eq(table._site, site.name) : undefined
  /** A new row's site column, when its type has one. */
  const siteColumn = (name: string) => scopedType(name) ? { _site: site.name } : {}
  /** Rows of a site-keyed system table (singletons, routes, redirects) this site sees: its own and shared ones. */
  const visibleSites = (table: Db) => schema.sites ? inArray(table.site, [site.name, '']) : undefined
  /** The condition picking a singleton's row for this site (its own, or the shared one). */
  const singletonSite = (table: Db, name: string) => schema.sites ? eq(table.site, siteOfType(name)) : undefined
  /** A localized singleton keeps a row per locale. */
  const localizedSingleton = (name: string) => !!schema.singletons[name]?.localized
  /** A singleton's row name: its name, with a localized one's locale (`home#de`; the default when none). */
  function rowName(name: string, locale?: string): string {
    if (!localizedSingleton(name))
      return name
    const code = locale ?? locales.default
    if (!locales.codes.includes(code))
      throw new ValidationError([{ path: 'locale', message: `expected one of: ${locales.codes.join(', ')}` }])
    return `${name}#${code}`
  }
  /** The locale a localized singleton's key or row name carries. */
  const keyLocale = (key: string) => /#([^@]+)/.exec(key)?.[1]
  /**
   * The id a singleton's relation rows, revisions and route rows carry: its row name, qualified by its site
   * when each site has its own (`settings@shop`, `home#de@shop`), so sites' and locales' copies never mix.
   */
  const singletonKey = (name: string, locale?: string) => scopedType(name) ? `${rowName(name, locale)}@${site.name}` : rowName(name, locale)
  /** The id revisions and links are kept under: an entry's own, a singleton's key (`id`: a localized one's locale). */
  const recordId = (name: string, id: string) => name in schema.singletons ? singletonKey(name, localizedSingleton(name) && id !== name ? id : undefined) : id
  /** A route row's site column for a type, and the condition finding that type's route rows. */
  const routeSiteColumn = (source: string) => schema.sites ? { site: siteOfType(source) } : {}
  const routesOf = (table: Db, source: string) => schema.sites ? eq(table.site, siteOfType(source)) : undefined
  /** Redirects: this site's. */
  const redirectSite = () => schema.sites ? eq(redirectsTable.site, site.name) : undefined
  const redirectSiteColumn = () => schema.sites ? { site: site.name } : {}
  /** Cloudflare D1: no transactions, and at most 100 bound parameters per statement. */
  const d1 = !driver.capabilities.transactions
  /** Inserts of `rows`, as few statements as the engine's parameter limit allows (D1: 100 per statement). */
  const insertsOf = (q: Db, table: Db, rows: Record<string, unknown>[]): unknown[] => {
    if (!rows.length)
      return []
    const size = d1 ? Math.max(1, Math.floor(100 / Object.keys(rows[0]!).length)) : 1000
    return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => q.insert(table).values(rows.slice(i * size, (i + 1) * size)))
  }
  // a site may have fewer locales, and its own default
  const locales = resolveLocales({ ...schema.locales, ...options.siteLocales?.codes && { codes: options.siteLocales.codes }, ...options.siteLocales?.default && { default: options.siteLocales.default } })
  const localized = (source: string) => !!schema.collections[source]?.localized
  /** The fields one value of which serves every locale of a localized collection. */
  const sharedKeys = (source: string) => localized(source) ? Object.entries(schema.collections[source]!.fields).filter(([, f]) => f.shared).map(([key]) => key) : []
  /** Blocks fields whose structure every locale shares (`localized: { blocks: 'shared' }`). */
  const sharedBlockKeys = (source: string) => {
    const option = schema.collections[source]?.localized
    return typeof option === 'object' && option.blocks === 'shared'
      ? Object.entries(schema.collections[source]!.fields).filter(([, f]) => f.type === 'blocks' && !f.shared).map(([key]) => key)
      : []
  }
  /** A localized entry's locale and translation group, from its draft row (which every entry has). */
  const placeOf = async (q: Db, source: string, id: string): Promise<{ _locale: string, _group: string | null } | undefined> => {
    const table = tables[collectionTable(source)]
    return (await q.select({ _locale: table._locale, _group: table._group }).from(table).where(and(eq(table._id, id), inSite(source, table))).limit(1))[0]
  }
  /** A localized entry's locale: undefined when the collection isn't localized, or there's no such entry. */
  const entryLocale = async (q: Db, source: string, id: string): Promise<string | undefined> =>
    localized(source) ? (await placeOf(q, source, id))?._locale : localizedSingleton(source) ? keyLocale(id) : undefined
  /** The translations of the entries in `groups` (a group is its first entry's id): ids by locale, per group. */
  const translationsOf = async (q: Db, table: Db, groups: string[]): Promise<Map<string, Record<string, string>>> => {
    const byGroup = new Map<string, Record<string, string>>()
    const size = d1 ? 45 : 500 // each id is bound twice
    for (let i = 0; i < groups.length; i += size) {
      const chunk = groups.slice(i, i + size)
      const rows: { id: string, locale: string, group: string | null }[] = await q.select({ id: table._id, locale: table._locale, group: table._group })
        .from(table).where(or(inArray(table._group, chunk), inArray(table._id, chunk)))
      for (const row of rows) {
        const group = row.group ?? row.id
        byGroup.set(group, { ...byGroup.get(group), [row.locale]: row.id })
      }
    }
    return byGroup
  }

  /** Drafts are kept apart from what the site serves; other types publish every save. */
  const versioned = (source: string) => !!(schema.collections[source] ?? schema.singletons[source])?.versioned

  // every redirect, for the request middleware; reread at most every 30 s, and after this instance's writes.
  // ponytail: another instance's change shows up within 30 s, not at once
  let redirectCache: { at: number, list: Promise<Redirect[]> } | undefined
  // after a save commits: one that changed URLs changed redirects too
  const forgetRedirects = () => {
    redirectCache = undefined
  }
  const REDIRECT_TTL = 30_000
  const readRedirects = async (): Promise<Redirect[]> =>
    (await db.select().from(redirectsTable).where(schema.sites ? eq(redirectsTable.site, site.name) : undefined).orderBy(asc(redirectsTable.createdAt), asc(redirectsTable.id)) as (Redirect & { createdAt: string })[])
      .map(({ id, source, target, status, auto }) => ({ id, source, target, status, auto: Boolean(auto) }))

  // The same reads and writes on either copy of the content tables: drafts, or what the site serves.
  // Each stage's functions reach the other through `stages` only when called, after it's set.
  const stages: Record<Stage, ReturnType<typeof staged>> = { draft: staged('draft'), published: staged('published') }

  function staged(stage: Stage) {
    const pick = (table: string) => tables[stage === 'draft' ? table : published(table)]
    const relations = pick('atelier_relations')
    const routes = pick('atelier_routes')
    const singletons = pick('atelier_singletons')

    function collection(name: string): { definition: CollectionDefinition, table: Db } {
      const definition = schema.collections[name]
      if (!definition)
        throw new NotFoundError(`No collection "${name}"`)
      return { definition, table: pick(collectionTable(name)) }
    }

    function singleton(name: string) {
      const definition = schema.singletons[name]
      if (!definition)
        throw new NotFoundError(`No singleton "${name}"`)
      return definition
    }

    const CHUNK = d1 ? 90 : 500 // ids per IN list, under every engine's parameter limit (D1's is 100)

    /** Entries by id, with their relations: two queries per 500 ids. Missing ids are absent. */
    async function readMany(q: Db, name: string, ids: string[]): Promise<Map<string, Entry>> {
      const { definition, table } = collection(name)
      const found = new Map<string, Entry>()
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = [...new Set(ids.slice(i, i + CHUNK))]
        // another site's entry reads as missing
        const rows: Record<string, unknown>[] = await q.select().from(table).where(and(inArray(table._id, chunk), inSite(name, table)))
        if (!rows.length)
          continue
        const links: (RelationRow & { sourceId: string })[] = await q.select().from(relations)
          .where(and(eq(relations.source, name), inArray(relations.sourceId, rows.map(r => r._id as string))))
          .orderBy(asc(relations.sourceId), asc(relations.field), asc(relations.position))
        const urls = await storedPaths(q, name, definition.route, rows.map(r => r._id as string))
        const live = stage === 'draft' ? await publishedVersions(q, name, rows.map(r => r._id as string)) : undefined
        const groupOf = (row: Record<string, unknown>) => (row._group ?? row._id) as string
        const translations = definition.localized ? await translationsOf(q, table, [...new Set(rows.map(groupOf))]) : undefined
        for (const row of rows) {
          const id = row._id as string
          const data = fromRow(definition.fields, row)
          // top-level relations live only in the relations table; nested ones are also in their JSON column
          for (const [key, field] of Object.entries(definition.fields)) {
            if (field.type !== 'relation')
              continue
            const targets = links.filter(l => l.sourceId === id && (l.field === key || l.field === field.renamedFrom)).map(l => l.targetId)
            data[key] = field.many ? targets : targets[0] ?? null
          }
          found.set(id, {
            id,
            version: row._version as number,
            createdAt: row._createdAt as string,
            updatedAt: row._updatedAt as string,
            createdBy: (row._createdBy as string | null) ?? null,
            // a localized entry has its own locale's URL only
            ...definition.route && (translations ? { path: urls.get(id)?.[0]?.path ?? null } : presentPaths(definition.route, urls.get(id) ?? [])),
            publishedVersion: live ? live.get(id) ?? null : row._version as number,
            ...translations && { locale: row._locale as string, translations: translations.get(groupOf(row)) ?? {} },
            data,
          })
        }
      }
      return found
    }

    const read = async (q: Db, name: string, id: string) => (await readMany(q, name, [id])).get(id)

    /** The published version of each of these drafts that has one. */
    async function publishedVersions(q: Db, name: string, ids: string[]): Promise<Map<string, number>> {
      const table = tables[published(collectionTable(name))]
      const rows: { id: string, version: number }[] = await q.select({ id: table._id, version: table._version }).from(table).where(inArray(table._id, ids))
      return new Map(rows.map(r => [r.id, r.version]))
    }

    /** The stored paths of routable entries, by entry id: one query, none when not routable. */
    async function storedPaths(q: Db, source: string, route: RouteDefinition | undefined, ids: string[]): Promise<Map<string, EntryPath[]>> {
      const byId = new Map<string, EntryPath[]>()
      if (!route || !ids.length)
        return byId
      const rows: { path: string, locale: string, sourceId: string }[] = await q.select().from(routes)
        .where(and(eq(routes.source, source), inArray(routes.sourceId, ids), schema.sites ? eq(routes.site, siteOfType(source)) : undefined))
      for (const row of rows)
        byId.set(row.sourceId, [...byId.get(row.sourceId) ?? [], { path: row.path, locale: row.locale }])
      return byId
    }

    async function readSingleton(q: Db, name: string, locale?: string): Promise<SingletonEntry | undefined> {
      const row_ = rowName(name, locale)
      const [row] = await q.select().from(singletons).where(and(eq(singletons.name, row_), singletonSite(singletons, name))).limit(1)
      if (!row)
        return undefined
      const { route, fields } = singleton(name)
      const key = singletonKey(name, locale)
      const urls = route ? (await storedPaths(q, name, route, [key])).get(key) ?? [] : []
      const live = tables.atelier_p_singletons
      const publishedVersion = stage === 'published'
        ? row.version
        : (await q.select({ version: live.version }).from(live).where(and(eq(live.name, row_), singletonSite(live, name))).limit(1))[0]?.version ?? null
      // a localized singleton's version is at its own locale's URL, as a translation is
      const paths = route && (localizedSingleton(name) ? { path: urls[0]?.path ?? null } : presentPaths(route, urls))
      return { name, version: row.version, updatedAt: row.updatedAt, ...paths, publishedVersion, ...localizedSingleton(name) && { locale: keyLocale(row_) }, data: renamed(fields, row.data) }
    }

    /**
     * Fills the `href` of rich-text links to entries (a `link` mark with `attrs: { to, id }`, `id` left out for a
     * singleton) with the entry's current URL, anywhere in `datas`: links survive renames. A link to an entry
     * without a URL, or one that's gone, gets `href: null`. One query per linked type.
     */
    async function linked<T>(input: T): Promise<T> {
      // shared blocks first: their content has links too
      const refs = schema.collections[SHARED_BLOCKS] ? sharedRefs(input) : new Set<string>()
      const found = refs.size ? await readMany(db, SHARED_BLOCKS, [...refs]) : undefined
      const datas = found ? resolveShared(input, ref => (found.get(ref)?.data.block as BlockInstance[] | undefined)?.[0]) : input
      const marks: { to: string, id?: string, href?: string | null }[] = []
      const walk = (value: unknown): void => {
        if (Array.isArray(value))
          return value.forEach(walk)
        if (!value || typeof value !== 'object')
          return
        const node = value as { type?: unknown, attrs?: { to?: unknown, id?: unknown } }
        if (node.type === 'link' && node.attrs && typeof node.attrs.to === 'string' && (node.attrs.id === undefined || typeof node.attrs.id === 'string'))
          marks.push(node.attrs as { to: string, id?: string })
        Object.values(value).forEach(walk)
      }
      walk(datas)
      const bySource = new Map<string, typeof marks>()
      for (const mark of marks)
        bySource.set(mark.to, [...bySource.get(mark.to) ?? [], mark])
      for (const [source, list] of bySource) {
        const route = routeOf(source)
        const singletonLink = !!schema.singletons[source]
        const ids = [...new Set(list.map(m => singletonLink ? source : m.id).filter((id): id is string => !!id))]
        const stored = await storedPaths(db, source, route, ids)
        for (const mark of list) {
          const urls = stored.get(singletonLink ? source : mark.id ?? '')
          mark.href = route && urls ? presentPaths(route, urls).path : null
        }
      }
      return datas
    }

    const routeOf = (source: string): RouteDefinition | undefined => (schema.collections[source] ?? schema.singletons[source])?.route

    interface RouteRow extends EntryPath { source: string, sourceId: string }
    /** The route rows an entry's save replaces: its own and, for nested routes, every entry below it. */
    interface PathPlan {
      source: string
      ids: string[]
      rows: RouteRow[]
      /** The rows they replace. */
      old: RouteRow[]
      /** Redirect old URLs to new ones (`route.redirects`). */
      redirect: boolean
    }

    const MAX_DEPTH = 100 // nested routes deeper than this are refused as a cycle

    /** The entry a nested route's entry sits under, as stored. */
    async function parentOf(q: Db, source: string, key: string, id: string): Promise<string | undefined> {
      const [row] = await q.select({ targetId: relations.targetId }).from(relations)
        .where(and(eq(relations.source, source), eq(relations.sourceId, id), eq(relations.field, key))).limit(1)
      return row?.targetId
    }

    /** Entries directly under `id`, with their data. */
    async function childrenOf(q: Db, source: string, key: string, id: string): Promise<Entry[]> {
      const rows: { sourceId: string }[] = await q.select({ sourceId: relations.sourceId }).from(relations)
        .where(and(eq(relations.source, source), eq(relations.field, key), eq(relations.target, source), eq(relations.targetId, id)))
      return [...(await readMany(q, source, rows.map(r => r.sourceId))).values()]
    }

    /** Paths under a parent's: each locale's under the parent's path in that locale (or its shared one). */
    const under = (own: EntryPath[], parent: EntryPath[] | undefined) => !parent?.length
      ? own
      : own.map(({ locale, path }) => {
          const base = (parent.find(p => p.locale === locale) ?? parent.find(p => p.locale === ''))?.path
          return { locale, path: base === undefined ? path : `${base === '/' ? '' : base}${path}` }
        })

    /** An entry's own paths; a localized one's only in its locale, under that locale even for a pattern every locale shares. */
    const ownPaths = (source: string, data: Record<string, unknown>, locale: string | undefined): EntryPath[] => {
      const paths = entryPaths(routeOf(source), data)
      return locale === undefined ? paths : paths.filter(p => p.locale === '' || p.locale === locale).map(p => ({ locale, path: p.path }))
    }

    /**
     * The route rows for saving `data` to an entry: its paths, under its parent's for a nested route, and
     * when it already exists, the recomputed paths of every entry below it. 422 when it would be its own ancestor.
     * `locale`: a localized entry's, looked up when it exists.
     */
    async function planPaths(q: Db, source: string, sourceId: string, data: Record<string, unknown>, existing: boolean, locale?: string): Promise<PathPlan | undefined> {
      const route = routeOf(source)
      if (!route)
        return undefined
      if (localized(source))
        locale ??= await entryLocale(q, source, sourceId) ?? locales.default
      let own = ownPaths(source, data, locale)
      const key = route.parent
      if (key && typeof data[key] === 'string') {
      // walk up to refuse a cycle; the parent's stored paths are the base
        let ancestor: string | undefined = data[key] as string
        for (let depth = 0; ancestor; depth++) {
          if (ancestor === sourceId || depth >= MAX_DEPTH)
            throw new ValidationError([{ path: key, message: 'An entry can\'t be placed under itself or an entry below it' }])
          ancestor = await parentOf(q, source, key, ancestor)
        }
        const parent: EntryPath[] = await q.select({ path: routes.path, locale: routes.locale }).from(routes)
          .where(and(eq(routes.source, source), eq(routes.sourceId, data[key] as string), routesOf(routes, source)))
        if (stage === 'published' && !parent.length)
          throw new ValidationError([{ path: key, message: 'Its parent isn\'t published: publish that first, so this one has a URL under it' }])
        own = under(own, parent)
      }
      // only what the site serves redirects: a draft's URL isn't public yet
      const plan: PathPlan = { source, ids: [sourceId], rows: own.map(p => ({ ...p, source, sourceId })), old: [], redirect: stage === 'published' && route.redirects !== false }
      if (key && existing) {
        const walk = async (id: string, paths: EntryPath[], depth: number) => {
          for (const child of await childrenOf(q, source, key, id)) {
            if (plan.ids.includes(child.id) || depth >= MAX_DEPTH)
              continue
            const childPaths = under(ownPaths(source, child.data, child.locale), paths)
            plan.ids.push(child.id)
            plan.rows.push(...childPaths.map(p => ({ ...p, source, sourceId: child.id })))
            await walk(child.id, childPaths, depth + 1)
          }
        }
        await walk(sourceId, own, 0)
      }
      if (existing)
        plan.old = await q.select().from(routes).where(and(eq(routes.source, source), inArray(routes.sourceId, plan.ids), routesOf(routes, source)))
      return plan
    }

    /**
     * 422 when a planned path is too long or already another entry's. Paths shared by every locale
     * conflict with any locale's; per-locale ones only within their locale.
     * ponytail: two saves racing for one free path both pass this; the (path, locale) primary key stops the
     * second, which then fails as a database error rather than a 422.
     */
    async function assertPathsFree(q: Db, plan: PathPlan | undefined): Promise<void> {
      if (!plan?.rows.length)
        return
      const route = routeOf(plan.source)!
      const [saved] = plan.ids
      // errors go on the first placeholder's field (a fixed path, like a singleton's "/", has none)
      const fieldOf = (locale: string) => /\{([a-z][a-z0-9]*)\}/i.exec(patterns(route).find(([l]) => l === locale)![1])?.[1] ?? ''
      const whose = (row: RouteRow) => row.sourceId === saved ? 'The URL' : `The URL of entry "${row.sourceId}", below this one,`
      const errors: FieldError[] = []
      for (const row of plan.rows) {
        if (row.path.length > MAX_PATH)
          errors.push({ path: fieldOf(row.locale), message: `${whose(row)} would be longer than ${MAX_PATH} characters` })
      }
      // ponytail: with sites, a shared type's path is checked against this site's paths only, not every site's
      const taken: RouteRow[] = await q.select().from(routes).where(and(inArray(routes.path, [...new Set(plan.rows.map(p => p.path))]), visibleSites(routes)))
      for (const row of plan.rows) {
      // rows of the entries this save moves are replaced, so they don't count
        const other = taken.find(t => t.path === row.path && !(t.source === plan.source && plan.ids.includes(t.sourceId))
          && (t.locale === row.locale || t.locale === '' || row.locale === ''))
        ?? plan.rows.find(r => r !== row && r.sourceId !== row.sourceId && r.path === row.path && (r.locale === row.locale || r.locale === '' || row.locale === ''))
        if (other)
          errors.push({ path: fieldOf(row.locale), message: `${whose(row)} ${row.path}${row.locale ? ` (${row.locale})` : ''} is already used by ${other.source in schema.singletons ? `singleton "${other.source}"` : `entry "${other.sourceId}" in "${other.source}"`}` })
      }
      if (errors.length)
        throw new ValidationError(errors)
    }

    /**
     * The statements replacing the stored route rows with a plan's. An entry's URL takes over any redirect
     * from it; a URL that changed redirects to the new one (301), and redirects to the old URL are pointed
     * at the new one, so they don't chain.
     */
    function pathStatements(q: Db, plan: PathPlan | undefined): unknown[] {
      if (!plan)
        return []
      const rows = plan.rows.filter(r => r.path.length <= MAX_PATH)
      const moved = plan.old.flatMap((old) => {
        const now = rows.find(r => r.sourceId === old.sourceId && r.locale === old.locale)
        return now && now.path !== old.path ? [[old.path, now.path] as const] : []
      })
      const createdAt = new Date().toISOString()
      return [
        q.delete(routes).where(and(eq(routes.source, plan.source), inArray(routes.sourceId, plan.ids), routesOf(routes, plan.source))),
        ...rows.length ? [q.insert(routes).values(rows.map(r => ({ ...r, ...routeSiteColumn(plan.source) })))] : [],
        ...rows.length && stage === 'published' ? [q.delete(redirectsTable).where(and(inArray(redirectsTable.source, [...new Set(rows.map(r => r.path))]), redirectSite()))] : [],
        ...plan.redirect
          ? moved.flatMap(([from, to]) => [
              q.update(redirectsTable).set({ target: to }).where(and(eq(redirectsTable.target, from), redirectSite())),
              q.delete(redirectsTable).where(and(eq(redirectsTable.source, from), redirectSite())),
              q.insert(redirectsTable).values({ id: crypto.randomUUID(), source: from, target: to, status: 301, auto: true, createdAt, ...redirectSiteColumn() }),
            ])
          : [],
      ]
    }

    /** The plan for an entry changed as a side effect (a mirrored or nullified relation), checked. */
    async function sidePlan(q: Db, source: string, sourceId: string, data: Record<string, unknown>): Promise<PathPlan | undefined> {
      const plan = await planPaths(q, source, sourceId, data, true)
      await assertPathsFree(q, plan)
      return plan
    }

    /** Calls `visit` for every relation value in `data`, nested ones included; `set` replaces it. */
    function eachRelation(fields: Record<string, Field>, data: Record<string, unknown>, visit: (field: RelationField, value: unknown, set: (value: unknown) => void) => void) {
      for (const [key, field] of Object.entries(fields)) {
        const value = data[key]
        if (field.type === 'relation')
          visit(field, value, (v) => { data[key] = v })
        else if (field.type === 'object' && value && typeof value === 'object')
          eachRelation(field.fields, value as Record<string, unknown>, visit)
        else if (field.type === 'repeater' && Array.isArray(value))
          value.forEach(item => eachRelation(field.fields, item, visit))
      }
    }

    /**
     * Replaces relation ids with the entries they point to, `depth` levels deep, for many entries at once:
     * per level, one batched read per target collection. A missing entry reads as null, or is left out of a list.
     */
    async function populate(q: Db, fields: Record<string, Field>, datas: Record<string, unknown>[], depth: number): Promise<Record<string, unknown>[]> {
      if (depth <= 0 || !datas.length)
        return datas
      const out = datas.map(d => structuredClone(d))
      const wanted = new Map<string, Set<string>>()
      for (const data of out) {
        eachRelation(fields, data, (field, value) => {
          const set = wanted.get(field.to) ?? new Set<string>()
          for (const id of Array.isArray(value) ? value : value ? [value] : [])
            set.add(String(id))
          wanted.set(field.to, set)
        })
      }
      const loaded = new Map<string, Entry>()
      for (const [to, ids] of wanted) {
        const entries = [...(await readMany(q, to, [...ids])).values()]
        const populated = await populate(q, collection(to).definition.fields, entries.map(e => e.data), depth - 1)
        entries.forEach((entry, i) => loaded.set(`${to}:${entry.id}`, { ...entry, data: populated[i]! }))
      }
      for (const data of out) {
        eachRelation(fields, data, (field, value, set) => {
          const entry = (id: unknown) => loaded.get(`${field.to}:${id}`)
          set(Array.isArray(value) ? value.map(entry).filter(Boolean) : value ? entry(value) ?? null : null)
        })
      }
      return out
    }

    /** A page of entries matching a query, populated to `depth`. */
    async function list(name: string, options: ListOptions): Promise<EntryList> {
      const { definition, table } = collection(name)
      const context = {
        dialect: driver.dialect,
        fields: definition.fields,
        table,
        relations,
        source: name,
        relationsQuery: (where: unknown) => db.select({ one: sql`1` }).from(relations).where(where),
      }
      const filters = [
        ...options.filter ? [compileFilter(context, options.filter)] : [],
        ...options.createdBy === undefined ? [] : [eq(table._createdBy, options.createdBy)],
        ...definition.localized ? [eq(table._locale, options.locale ?? locales.default)] : [],
        ...scopedType(name) ? [eq(table._site, site.name)] : [],
      ]
      const where = filters.length ? and(...filters) : undefined
      const keys = compileSort(context, options.sort)
      const limit = options.limit ?? 20
      const page = options.cursor
        ? and(where, afterCursor(keys, decodeCursor(options.cursor, keys)))
        : where
      let select = db.select({ id: table._id, ...Object.fromEntries(keys.map((k, i) => [`k${i}`, k.column])) })
        .from(table).where(page).orderBy(...orderBy(keys)).limit(limit + 1)
      if (!options.cursor && options.offset)
        select = select.offset(options.offset)
      const rows: Record<string, unknown>[] = await select
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(table).where(where)

      const more = rows.length > limit
      const pageRows = rows.slice(0, limit)
      const found = await readMany(db, name, pageRows.map(r => r.id as string))
      let items = pageRows.map(r => found.get(r.id as string)!).filter(Boolean)
      if (definition.localized && options.locale !== undefined)
        items = await inLocale(db, name, items, options.locale)
      const populated = await linked(await populate(db, definition.fields, items.map(e => e.data), options.depth ?? 0))
      const last = pageRows.at(-1)
      return {
        items: items.map((entry, i) => ({ ...entry, data: populated[i]! })),
        total: Number(count),
        next: more && last ? encodeCursor(keys.map((_, i) => last[`k${i}`] ?? null)) : null,
      }
    }

    /**
     * The save of an entry. Creating in a localized collection: `placement` is the new version's locale, and
     * the group of the entry it translates (none for a new entry).
     */
    function entryTarget(name: string, id: string, expected: number | undefined, authorId?: string, placement?: { locale: string, group?: string }): Target<Entry> {
      const { definition, table } = collection(name)
      const target: Target<Entry> = {
        what: `entry "${id}" in "${name}"`,
        fields: definition.fields,
        source: name,
        sourceId: id,
        locale: placement?.locale,
        group: placement?.group,
        expected,
        authorId,
        isUnique: (q, publishing) => async (field, value) => {
          // a localized entry's values are unique within its locale
          target.locale ??= await entryLocale(q, name, id)
          const within = scopedType(name) ? site.name : undefined
          return await isUnique(q, table, field, value, id, target.locale, within)
            && (!publishing || await isUnique(q, tables[published(collectionTable(name))], field, value, id, target.locale, within))
        },
        // another site's entry of that id reads as missing: never updated from here
        currentVersion: async q => (await q.select({ version: table._version }).from(table).where(and(eq(table._id, id), inSite(name, table))))[0]?.version,
        write: (q, data, version, now) => {
          const row = toRow(definition.fields, data)
          const place = definition.localized ? { _locale: placement?.locale ?? locales.default, _group: placement?.group ?? null } : {}
          return expected === undefined
            ? q.insert(table).values({ _id: id, _version: version, _createdAt: now, _updatedAt: now, _createdBy: authorId ?? null, ...siteColumn(name), ...place, ...row })
          // only the version the client read is updated: a concurrent save makes this match nothing
            : q.update(table).set({ ...row, _version: version, _updatedAt: now }).where(and(eq(table._id, id), eq(table._version, expected), inSite(name, table)))
        },
        publish: (q, remove) => {
          const live = tables[published(collectionTable(name))]
          return [q.delete(live).where(and(eq(live._id, id), inSite(name, live))), ...remove ? [] : [q.insert(live).select(q.select().from(table).where(and(eq(table._id, id), inSite(name, table))))]]
        },
        read: async q => (await read(q, name, id))!,
      }
      return target
    }

    function singletonTarget(name: string, expected: number | undefined, authorId?: string, locale?: string): Target<SingletonEntry> {
      const row = rowName(name, locale)
      return {
        what: `singleton "${name}"${row === name ? '' : ` (${keyLocale(row)})`}`,
        fields: singleton(name).fields,
        source: name,
        sourceId: singletonKey(name, locale),
        ...localizedSingleton(name) && { locale: keyLocale(row) },
        expected,
        authorId,
        currentVersion: async q => (await readSingleton(q, name, locale))?.version,
        write: (q, data, version, now) => expected === undefined
          ? q.insert(singletons).values({ ...schema.sites ? { site: siteOfType(name) } : {}, name: row, data, version, updatedAt: now })
          : q.update(singletons).set({ data, version, updatedAt: now }).where(and(eq(singletons.name, row), eq(singletons.version, expected), singletonSite(singletons, name))),
        publish: (q, remove) => {
          const live = tables.atelier_p_singletons
          return [q.delete(live).where(and(eq(live.name, row), singletonSite(live, name))), ...remove ? [] : [q.insert(live).select(q.select().from(singletons).where(and(eq(singletons.name, row), singletonSite(singletons, name))))]]
        },
        read: async q => (await readSingleton(q, name, locale))!,
      }
    }

    /** The write, its relation rows and its revision, as unexecuted statements. */
    function statements(q: Db, target: Target<unknown>, data: Record<string, unknown>, now: string, plan?: PathPlan, publishing = false) {
      const { source, sourceId, expected } = target
      const version = expected === undefined ? 1 : expected + 1
      const links = [...relationRows(target.fields, data), ...mediaRows(target.fields, data, schema.blocks), ...sharedRows(data)]
      return [
        target.write(q, data, version, now),
        ...expected === undefined ? [] : [q.delete(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId)))],
        ...insertsOf(q, relations, links.map(l => ({ source, sourceId, ...l }))),
        ...pathStatements(q, plan),
        // unique per (source, version): a stale save always collides with the winning save's revision
        q.insert(revisions).values({ id: crypto.randomUUID(), source, sourceId, version, data, createdAt: now, authorId: target.authorId ?? null, published: publishing }),
      ]
    }

    /**
     * The statements publishing what `statements` just wrote (run after them): the row and its relations
     * copied to the published tables, and its published URLs, which redirect from the old ones. 422 when a
     * URL or unique value is another published entry's, or a nested entry's parent isn't published.
     */
    async function publication(q: Db, target: Target<unknown>, data: Record<string, unknown>): Promise<unknown[]> {
      const live = stages.published
      const { source, sourceId } = target
      const plan = await live.planPaths(q, source, sourceId, data, true, target.locale)
      await live.assertPathsFree(q, plan)
      const mine = (t: Db) => and(eq(t.source, source), eq(t.sourceId, sourceId))
      return [
        ...target.publish(q),
        q.delete(live.relations).where(mine(live.relations)),
        q.insert(live.relations).select(q.select().from(relations).where(mine(relations))),
        ...live.pathStatements(q, plan),
      ]
    }

    /** The statements taking an entry off the site: its published row, relations and URLs. */
    function unpublication(q: Db, target: Target<unknown>): unknown[] {
      const live = stages.published
      const mine = (t: Db) => and(eq(t.source, target.source), eq(t.sourceId, target.sourceId))
      return [...target.publish(q, true), q.delete(live.relations).where(mine(live.relations)), q.delete(live.routes).where(and(mine(live.routes), routesOf(live.routes, target.source)))]
    }

    /**
     * The statements publishing one saved version as it was, leaving the draft alone: for a scheduled publish
     * of the version chosen when it was scheduled. Validated against the schema as it is now, and 422 for a
     * URL or unique value another published entry has. Marks that revision published.
     */
    async function pinnedPublication(q: Db, source: string, sourceId: string, version: number, data: Record<string, unknown>): Promise<unknown[]> {
      const live = stages.published
      const singletonPin = source in schema.singletons
      const fields = singletonPin ? singleton(source).fields : collection(source).definition.fields
      const publishedTable = singletonPin ? undefined : tables[published(collectionTable(source))]
      const locale = await entryLocale(q, source, sourceId)
      const result = await validateEntry(fields, data, {
        isUnique: publishedTable && ((field, value) => isUnique(q, publishedTable, field, value, sourceId, locale, scopedType(source) ? site.name : undefined)),
        blocks: schema.blocks,
        maxNestingDepth: options.maxNestingDepth,
        sharedTypes: await sharedTypes(q, source, data),
      })
      if (!result.success)
        throw new ValidationError(result.errors)
      const plan = await live.planPaths(q, source, sourceId, result.value, true, locale)
      await live.assertPathsFree(q, plan)
      const now = new Date().toISOString()
      const links = [...relationRows(fields, result.value), ...mediaRows(fields, result.value, schema.blocks), ...sharedRows(result.value)]
      const mine = (t: Db) => and(eq(t.source, source), eq(t.sourceId, sourceId))
      let row: unknown[]
      if (publishedTable) {
        const draft = await read(q, source, sourceId)
        if (!draft)
          throw new NotFoundError(`No entry "${sourceId}" in "${source}"`)
        row = [
          q.delete(publishedTable).where(and(eq(publishedTable._id, sourceId), inSite(source, publishedTable))),
          q.insert(publishedTable).values({ _id: sourceId, _version: version, _createdAt: draft.createdAt, _updatedAt: now, _createdBy: draft.createdBy, ...siteColumn(source), ...localized(source) && await placeOf(q, source, sourceId), ...toRow(fields, result.value) }),
        ]
      }
      else {
        const liveSingletons = tables.atelier_p_singletons
        row = [
          q.delete(liveSingletons).where(and(eq(liveSingletons.name, rowName(source, locale)), singletonSite(liveSingletons, source))),
          q.insert(liveSingletons).values({ ...schema.sites ? { site: siteOfType(source) } : {}, name: rowName(source, locale), data: result.value, version, updatedAt: now }),
        ]
      }
      return [
        ...row,
        q.delete(live.relations).where(mine(live.relations)),
        ...insertsOf(q, live.relations, links.map(l => ({ source, sourceId, ...l }))),
        ...live.pathStatements(q, plan),
        q.update(revisions).set({ published: true }).where(and(eq(revisions.source, source), eq(revisions.sourceId, sourceId), eq(revisions.version, version))),
      ]
    }

    /** A save of an entry changed as a side effect: published too when its type publishes every save. */
    async function sideSave(q: Db, target: Target<unknown>, data: Record<string, unknown>, now: string): Promise<unknown[]> {
      const publishing = !versioned(target.source)
      return [
        ...statements(q, target, data, now, await sidePlan(q, target.source, target.sourceId, data), publishing),
        ...publishing ? await publication(q, target, data) : [],
      ]
    }

    /**
     * Keeps two-way relations in sync with a save of `data`: each entry gaining or losing a link from it
     * gets the change on its inverse field, as a new version (and revision) of that entry. When the
     * inverse holds one entry, adding a link moves it: the entry it pointed to loses the link too.
     * Not validated, like a nullified reference: a required inverse left empty must be fixed on its next save.
     */
    async function mirrors(q: Db, target: Target<unknown>, data: Record<string, unknown>, now: string): Promise<unknown[]> {
      const { source, sourceId } = target
      const twoWay = Object.entries(target.fields).filter((e): e is [string, RelationField] => e[1].type === 'relation' && !!e[1].inverse)
      if (!twoWay.length || !(source in schema.collections))
        return []
      const ids = (value: unknown): string[] => value == null ? [] : Array.isArray(value) ? value as string[] : [value as string]
      const before: { field: string, targetId: string }[] = target.expected === undefined
        ? []
        : await q.select().from(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId)))

      const changed = new Map<string, { source: string, id: string, version: number, data: Record<string, unknown> }>()
      const edit = async (name: string, id: string, change: (data: Record<string, unknown>) => void) => {
        if (name === source && id === sourceId)
          return // a link to itself has no other side
        const key = entryKey(name, id)
        if (!changed.has(key)) {
          const current = await read(q, name, id)
          if (!current)
            return // a dangling id: nothing to mirror
          changed.set(key, { source: name, id, version: current.version, data: { ...current.data } })
        }
        change(changed.get(key)!.data)
      }
      const unlink = (data: Record<string, unknown>, key: string, id: string) => {
        const value = data[key]
        data[key] = Array.isArray(value) ? value.filter(v => v !== id) : value === id ? null : value
      }

      for (const [key, field] of twoWay) {
        const inverseKey = field.inverse!
        const inverse = collection(field.to).definition.fields[inverseKey] as RelationField
        const old = new Set(before.filter(r => r.field === key).map(r => r.targetId))
        const linked = new Set(ids(data[key]))
        for (const id of old) {
          if (!linked.has(id))
            await edit(field.to, id, d => unlink(d, inverseKey, sourceId))
        }
        for (const id of linked) {
          if (old.has(id))
            continue
          let previous: unknown
          await edit(field.to, id, (d) => {
            if (inverse.many) {
              d[inverseKey] = [...new Set([...ids(d[inverseKey]), sourceId])]
            }
            else {
              previous = d[inverseKey]
              d[inverseKey] = sourceId
            }
          })
          // an inverse holding one entry moves: the entry it pointed to loses its link to this one
          if (typeof previous === 'string' && previous !== sourceId)
            await edit(source, previous, d => unlink(d, key, id))
        }
      }
      const result: unknown[] = []
      for (const e of changed.values())
        result.push(...await sideSave(q, entryTarget(e.source, e.id, e.version, target.authorId), e.data, now))
      return result
    }

    /**
     * Keeps shared fields the same in every translation of a localized entry: each other locale's version
     * whose shared values differ from `data`'s gets them, as a new version (and revision) of it, published
     * too when the type publishes every save. Not validated, like a mirrored relation.
     */
    async function shares(q: Db, target: Target<unknown>, data: Record<string, unknown>, now: string): Promise<unknown[]> {
      const keys = sharedKeys(target.source)
      const structured = sharedBlockKeys(target.source)
      if (!keys.length && !structured.length)
        return []
      const { source, sourceId } = target
      const place = target.expected === undefined ? undefined : await placeOf(q, source, sourceId)
      const group = target.expected === undefined ? target.group : place && (place._group ?? sourceId)
      if (!group)
        return [] // a new entry: no translations yet
      const ids = Object.values((await translationsOf(q, collection(source).table, [group])).get(group) ?? {}).filter(id => id !== sourceId)
      // key order aside: JSON columns come back with their keys reordered on some engines
      const canonical = (x: unknown): unknown => Array.isArray(x)
        ? x.map(canonical)
        : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).toSorted().map(k => [k, canonical((x as Record<string, unknown>)[k])])) : x ?? null
      const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
      const result: unknown[] = []
      for (const entry of (await readMany(q, source, ids)).values()) {
        const next = {
          ...entry.data,
          ...Object.fromEntries(keys.map(key => [key, data[key] ?? null])),
          ...Object.fromEntries(structured.map(key => [key, sameStructure(data[key], entry.data[key], schema.blocks ?? {})])),
        }
        if ([...keys, ...structured].every(key => same(entry.data[key], next[key])))
          continue
        result.push(...await sideSave(q, entryTarget(source, entry.id, entry.version, target.authorId, { locale: entry.locale! }), next, now))
      }
      return result
    }

    /**
     * Entries of a localized collection as read in `locale`: each replaced by its translation in the first
     * locale of the fallback chain that has one, and its empty translated fields filled from the versions in
     * the locales after that (named in `fallbacks`).
     */
    async function inLocale(q: Db, name: string, entries: Entry[], locale: string): Promise<Entry[]> {
      const { fields } = collection(name).definition
      const chain = fallbackChain(locales, locale)
      const pick = (entry: Entry) => chain.map(l => entry.translations?.[l]).find(Boolean) ?? entry.id
      const swapped = await readMany(q, name, entries.map(pick).filter((id, i) => id !== entries[i]!.id))
      const located = entries.map(entry => swapped.get(pick(entry)) ?? entry)
      // the versions further down the chain, for the fields left empty
      const after = (entry: Entry) => !chain.includes(entry.locale!) ? [] : chain.slice(chain.indexOf(entry.locale!) + 1)
      const others = await readMany(q, name, located.flatMap(e => after(e).map(l => e.translations?.[l]).filter((id): id is string => !!id)))
      const translated = Object.entries(fields).filter(([, f]) => !f.shared).map(([key]) => key)
      return located.map((entry) => {
        const data = { ...entry.data }
        const fallbacks: Record<string, string> = {}
        for (const key of translated) {
          if (!isEmpty(data[key]))
            continue
          for (const l of after(entry)) {
            const value = others.get(entry.translations?.[l] ?? '')?.data[key]
            if (!isEmpty(value)) {
              data[key] = value
              fallbacks[key] = l
              break
            }
          }
        }
        return { ...entry, data, fallbacks }
      })
    }

    /**
     * The block type of each shared block `data` refers to, for validation (from their drafts). A shared block
     * can't hold references itself: one level only, so no cycles.
     */
    async function sharedTypes(q: Db, source: string, data: unknown): Promise<Record<string, string | undefined>> {
      const refs = [...sharedRefs(data)]
      if (!refs.length)
        return {}
      if (source === SHARED_BLOCKS)
        throw new ValidationError([{ path: 'block', message: 'a shared block can\'t contain shared blocks' }])
      const found = schema.collections[SHARED_BLOCKS] ? await stages.draft.readMany(q, SHARED_BLOCKS, refs) : new Map<string, Entry>()
      return Object.fromEntries(refs.map(ref => [ref, (found.get(ref)?.data.block as { type?: string }[] | undefined)?.[0]?.type]))
    }

    /**
     * Saves validated data, its relation rows and a revision atomically: in a transaction, or on D1 as
     * one batch whose revision insert (unique per source and version) doubles as the version check.
     */
    async function persist<T>(target: Target<T>, input: Record<string, unknown>, publish = false): Promise<T> {
      const creating = target.expected === undefined
      const now = new Date().toISOString()
      const publishing = publish || !versioned(target.source)

      const validate = async (q: Db) => {
        const result = await validateEntry(target.fields, collapseShared(input), { isUnique: target.isUnique?.(q, publishing), blocks: schema.blocks, maxNestingDepth: options.maxNestingDepth, sharedTypes: await sharedTypes(q, target.source, input) })
        if (!result.success)
          throw new ValidationError(result.errors)
        const plan = await planPaths(q, target.source, target.sourceId, result.value, !creating, target.locale)
        await assertPathsFree(q, plan)
        // planned before the write, from the published tables as they are
        const live = publishing ? await publication(q, target, result.value) : []
        return { data: result.value, plan, live }
      }
      // after a write matched nothing or failed: say why, if it's a missing row or a newer version
      const refuseStale = async (q: Db) => {
        const current = await target.currentVersion(q)
        if (current === undefined && !creating)
          throw new NotFoundError(`No ${target.what}`)
        if (current !== undefined && current !== target.expected)
          throw new ConflictError(current)
      }

      try {
        if (!driver.capabilities.transactions) {
          const { data, plan, live } = await validate(db)
          await refuseStale(db)
          await db.batch([...statements(db, target, data, now, plan, publishing), ...live, ...await mirrors(db, target, data, now), ...await shares(db, target, data, now)])
          return await target.read(db)
        }
        // InnoDB can deadlock two saves on its gap locks; a deadlock rolls back, so try again
        return await retryingDeadlocks(() => db.transaction(async (tx: Db) => {
          const { data, plan, live } = await validate(tx)
          const others = [...await mirrors(tx, target, data, now), ...await shares(tx, target, data, now)] // read before this save's write
          const [write, ...rest] = statements(tx, target, data, now, plan, publishing)
          if (!affected(await write))
            await refuseStale(tx)
          for (const statement of [...rest, ...live, ...others])
            await statement
          return target.read(tx)
        }))
      }
      catch (error) {
      // on D1, or when two first saves race, a lost race shows up as a failed write: report it as a conflict
      // (a transactional update already checked inside its transaction)
        const domain = error instanceof ValidationError || error instanceof ConflictError || error instanceof NotFoundError
        if (!domain && (creating || !driver.capabilities.transactions))
          await refuseStale(db)
        throw error
      }
    }

    /** The relation field a relation row was saved for, from its dot path (`faq.2.who`). */
    function relationAt(source: string, path: string): RelationField | undefined {
      let fields: Record<string, Field> | undefined = (schema.collections[source] ?? schema.singletons[source])?.fields
      let field: Field | undefined
      for (const key of path.split('.')) {
        if (/^\d+$/.test(key))
          continue // a repeater index
        field = fields?.[key] ?? Object.values(fields ?? {}).find(f => f.renamedFrom === key)
        fields = field && 'fields' in field ? field.fields : undefined
      }
      return field?.type === 'relation' ? field : undefined
    }

    /**
     * The statements deleting an entry, applying each referencing relation's onDelete: cascades delete
     * their entries too, nullified references are removed with a new version of the entry holding them.
     * Throws ReferencedError, before anything changes, when a restricting reference remains.
     */
    async function deletion(q: Db, name: string, id: string): Promise<unknown[]> {
      const deleted = new Map<string, [string, string]>()
      const nullified = new Map<string, { source: string, sourceId: string, removed: Set<string> }>()
      const restricted: Reference[] = []

      const visit = async (source: string, sourceId: string) => {
        deleted.set(entryKey(source, sourceId), [source, sourceId])
        const refs: (RelationRow & { source: string, sourceId: string })[] = await q.select().from(relations)
          .where(and(eq(relations.target, source), eq(relations.targetId, sourceId)))
        for (const ref of refs) {
          const holder = entryKey(ref.source, ref.sourceId)
          const field = relationAt(ref.source, ref.field)
          // the other side of a two-way relation is a mirror of this entry's own links: unlinked by default
          const onDelete = field?.onDelete ?? (field?.inverse ? 'nullify' : 'restrict')
          if (onDelete === 'cascade') {
            if (!deleted.has(holder))
              await visit(ref.source, ref.sourceId)
          }
          else if (onDelete === 'nullify') {
            const entry = nullified.get(holder) ?? { source: ref.source, sourceId: ref.sourceId, removed: new Set() }
            entry.removed.add(entryKey(source, sourceId))
            nullified.set(holder, entry)
          }
          else {
            restricted.push({ collection: ref.source, id: ref.sourceId, field: ref.field })
          }
        }
      }
      if (!await read(q, name, id)) // another site's reads as missing
        throw new NotFoundError(`No entry "${id}" in "${name}"`)
      await visit(name, id)

      // references held by entries deleted along with this one don't count
      const blocking = restricted.filter(r => !deleted.has(entryKey(r.collection, r.id)))
      if (blocking.length)
        throw new ReferencedError(`entry "${id}" in "${name}"`, blocking)

      const now = new Date().toISOString()
      const result: unknown[] = []
      for (const [source, sourceId] of deleted.values()) {
        const { table } = collection(source)
        result.push(
          q.delete(table).where(and(eq(table._id, sourceId), inSite(source, table))),
          q.delete(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId))),
          q.delete(routes).where(and(eq(routes.source, source), eq(routes.sourceId, sourceId), routesOf(routes, source))),
          ...unpublication(q, entryTarget(source, sourceId, undefined)),
        )
      }
      for (const { source, sourceId, removed } of nullified.values()) {
        if (deleted.has(entryKey(source, sourceId)))
          continue
        const current = source in schema.singletons ? await readSingleton(q, source, keyLocale(sourceId)) : await read(q, source, sourceId)
        const target = source in schema.singletons ? singletonTarget(source, current!.version, undefined, keyLocale(sourceId)) : entryTarget(source, sourceId, current!.version)
        // not validated: removing a required reference leaves an entry that must be fixed on its next save
        const data = withoutRefs(target.fields, current!.data, removed)
        result.push(...await sideSave(q, target, data, now))
      }
      return result
    }

    return { relations, routes, singletons, collection, singleton, readMany, read, readSingleton, linked, populate, list, inLocale, planPaths, assertPathsFree, pathStatements, entryTarget, singletonTarget, persist, deletion, unpublication, pinnedPublication }
  }

  const { collection, singleton, entryTarget, singletonTarget, persist, deletion, unpublication, pinnedPublication } = stages.draft
  /** Tells `onChange` about a committed write, after the redirect cache is reset. */
  const committed = <T>(change: Omit<StoreChange, 'site'>) => (result: T) => {
    // a singleton is known by its name outside the store, whatever key its rows carry
    void options.onChange?.({ ...change, id: change.type in schema.singletons ? change.type : change.id, site })
    return result
  }

  /** A before-hook: its error stops the operation. */
  const before = async <H extends LifecycleHook>(hook: H, context: LifecycleHooks[H]) => {
    await options.hooks?.(hook, { ...context, site })
  }
  /** An after-hook: its error is reported, the write stands. */
  const after = async <H extends LifecycleHook>(hook: H, context: LifecycleHooks[H]) => {
    try {
      await options.hooks?.(hook, { ...context, site })
    }
    catch (error) {
      if (options.onHookError)
        await Promise.resolve(options.onHookError(hook, context, error)).catch(() => {})
      else
        console.error(`[nuxt-atelier] The ${hook} hook failed for ${context && 'type' in context ? context.type : ''}:`, error)
    }
  }
  /** Read hooks around a read: abort before, adjust the entries after. */
  const reading = async <T extends Entry | SingletonEntry>(context: LifecycleHooks['beforeRead'], read: () => Promise<T[]>): Promise<T[]> => {
    await before('beforeRead', context)
    const entries = await read()
    if (entries.length)
      await options.hooks?.('afterRead', { type: context.type, stage: context.stage, entries, site } as LifecycleHooks['afterRead'])
    return entries
  }
  /**
   * A save with its hooks: before-create or -update (and -publish), which may change the data, the write,
   * then the after-hooks.
   */
  const hooked = async <T extends Entry | SingletonEntry>(target: Target<T>, data: Record<string, unknown>, publish: boolean | undefined, write: (data: Record<string, unknown>) => Promise<T>): Promise<T> => {
    const creating = target.expected === undefined
    const acting = { type: target.source, id: target.sourceId, actorId: target.authorId ?? null }
    const publishing = !!publish && versioned(target.source)
    const context = creating
      ? { ...acting, data: { ...data }, publish: !!publish }
      : { ...acting, data: { ...data }, version: target.expected!, publish: !!publish }
    await (creating ? before('beforeCreate', context) : before('beforeUpdate', context as LifecycleHooks['beforeUpdate']))
    if (publishing)
      await before('beforePublish', { ...acting, version: (target.expected ?? 0) + 1 })
    const entry = await write(context.data)
    await after(creating ? 'afterCreate' : 'afterUpdate', { ...acting, entry })
    if (publishing)
      await after('afterPublish', { ...acting, version: entry.version })
    return entry
  }

  /**
   * Where a new entry goes in a localized collection: its locale, and the translation group of the entry it
   * translates. 422 for a locale that isn't configured, one the entry already has, or for either option on
   * a collection that isn't localized.
   */
  const placement = async (name: string, input: SaveInput): Promise<{ locale: string, group?: string } | undefined> => {
    if (!localized(name)) {
      if (input.locale !== undefined || input.translationOf !== undefined)
        throw new ValidationError([{ path: 'locale', message: `"${name}" isn't localized` }])
      return undefined
    }
    const locale = input.locale ?? locales.default
    if (!locales.codes.includes(locale))
      throw new ValidationError([{ path: 'locale', message: `"${locale}" isn't one of the locales: ${locales.codes.join(', ')}` }])
    if (input.translationOf === undefined)
      return { locale }
    const original = await stages.draft.read(db, name, input.translationOf)
    if (!original)
      throw new NotFoundError(`No entry "${input.translationOf}" in "${name}" to translate`)
    if (original.translations?.[locale])
      throw new ValidationError([{ path: 'locale', message: `Entry "${input.translationOf}" already has a ${locale} version: "${original.translations[locale]}"` }])
    return { locale, group: (await placeOf(db, name, original.id))!._group ?? original.id }
  }

  /** 422 for a type that publishes every save: it has nothing to publish or unpublish. */
  const assertVersioned = (name: string) => {
    if (!versioned(name))
      throw new ValidationError([{ path: '', message: `"${name}" isn't versioned: every save is published` }])
  }
  const unpublish = async (target: Target<unknown>, actorId: string | null = null) => {
    assertVersioned(target.source)
    const acting = { type: target.source, id: target.sourceId, actorId }
    await before('beforeUnpublish', acting)
    if (!driver.capabilities.transactions) {
      await db.batch(unpublication(db, target))
    }
    else {
      await db.transaction(async (tx: Db) => {
        for (const statement of unpublication(tx, target))
          await statement
      })
    }
    forgetRedirects()
    committed({ type: target.source, id: target.sourceId, action: 'unpublished', live: true })(undefined)
    await after('afterUnpublish', acting)
  }

  return {
    /** An entry with its relations (as ids, or entries up to `depth` levels): the published one by default. */
    async get(name: string, id: string, options: GetOptions = {}): Promise<Entry | undefined> {
      const stageName = options.stage ?? 'published'
      const stage = stages[stageName]
      const [found] = await reading<Entry>({ type: name, id, stage: stageName }, async () => {
        let entry = await stage.read(db, name, id)
        if (entry && localized(name) && options.locale !== undefined)
          [entry] = await stage.inLocale(db, name, [entry], options.locale)
        return entry ? [{ ...entry, data: (await stage.linked(await stage.populate(db, collection(name).definition.fields, [entry.data], options.depth ?? 0)))[0]! }] : []
      })
      return found
    },

    /**
     * A page of entries: filtered, sorted and paginated (see ListQuery), populated to `depth`; published
     * ones by default. Throws QueryError (400) for a field or operator the collection can't use.
     */
    async list(name: string, options: ListOptions): Promise<EntryList> {
      const stage = options.stage ?? 'published'
      let page: EntryList | undefined
      await reading({ type: name, query: options, stage }, async () => {
        page = await stages[stage].list(name, options)
        return page.items
      })
      return page!
    },

    /**
     * Creates or updates an entry's draft atomically, publishing it with `publish` (and always, for a type
     * that isn't versioned). Throws ValidationError (422), ConflictError (409) when `version` isn't the
     * current one, or NotFoundError (404).
     */
    async save(name: string, input: SaveInput): Promise<Entry> {
      collection(name)
      if (input.id !== undefined && input.version === undefined)
        throw new Error('Updating an entry needs the version it was read at')
      const creating = input.id === undefined
      const target = entryTarget(name, input.id ?? crypto.randomUUID(), creating ? undefined : input.version, input.authorId, creating ? await placement(name, input) : undefined)
      const live = !!input.publish || !versioned(name)
      return hooked(target, input.data, input.publish, data => persist(target, data, input.publish).finally(forgetRedirects)
        .then(committed({ type: name, id: target.sourceId, action: live ? 'published' : 'saved', live })))
    },

    /**
     * Publishes an entry's draft, at the version the caller read: a new version, marked published in its
     * history, that the site serves at once. 409 on a newer draft, 422 as for a save.
     */
    async publish(name: string, id: string, input: { version: number, authorId?: string }): Promise<Entry> {
      assertVersioned(name)
      const draft = await stages.draft.read(db, name, id)
      if (!draft)
        throw new NotFoundError(`No entry "${id}" in "${name}"`)
      const acting = { type: name, id, actorId: input.authorId ?? null }
      await before('beforePublish', { ...acting, version: input.version + 1 })
      const entry = await persist(entryTarget(name, id, input.version, input.authorId), draft.data, true).finally(forgetRedirects)
        .then(committed({ type: name, id, action: 'published', live: true }))
      await after('afterPublish', { ...acting, version: entry.version })
      return entry
    },

    /**
     * Publishes one saved version of an entry (or a singleton: `id` is its name) as it was saved, leaving the
     * draft alone: what a scheduled publish runs, for the version chosen when it was scheduled. 404 for a
     * version that isn't in the history (pruned, or never saved), 422 as for publishing.
     */
    async publishVersion(name: string, id: string, version: number, actorId: string | null = null): Promise<void> {
      assertVersioned(name)
      const acting = { type: name, id, actorId, version }
      const [revision] = await this.owns(name, id)
        ? await db.select({ data: revisions.data }).from(revisions).where(and(eq(revisions.source, name), eq(revisions.sourceId, recordId(name, id)), eq(revisions.version, version))).limit(1)
        : []
      if (!revision)
        throw new NotFoundError(`No version ${version} of ${name in schema.singletons ? `"${name}"` : `entry "${id}" in "${name}"`}`)
      await before('beforePublish', acting)
      if (!driver.capabilities.transactions) {
        await db.batch(await pinnedPublication(db, name, recordId(name, id), version, revision.data))
      }
      else {
        await db.transaction(async (tx: Db) => {
          for (const statement of await pinnedPublication(tx, name, recordId(name, id), version, revision.data))
            await statement
        })
      }
      forgetRedirects()
      committed({ type: name, id, action: 'published', live: true })(undefined)
      await after('afterPublish', acting)
    },

    /** Takes an entry off the site; its draft stays. Its URLs answer 404 and don't redirect. */
    async unpublish(name: string, id: string, actorId: string | null = null): Promise<void> {
      if (!await stages.draft.read(db, name, id))
        throw new NotFoundError(`No entry "${id}" in "${name}"`)
      await unpublish(entryTarget(name, id, undefined), actorId)
    },

    /**
     * Deletes an entry, applying the onDelete of every relation that references it, atomically.
     * Throws ReferencedError (409) listing the entries that restrict it, or NotFoundError (404).
     */
    async delete(name: string, id: string, actorId: string | null = null): Promise<void> {
      const acting = { type: name, id, actorId }
      // a shared block still placed, on a draft or a live page: detach or remove its references first
      if (name === SHARED_BLOCKS) {
        const usage = await this.sharedUsage(id)
        if (usage.length)
          throw new ReferencedError(`shared block "${id}"`, usage, 'Detach or remove it everywhere first (POST /api/_atelier/shared-blocks/<id>/release).')
      }
      await before('beforeDelete', acting)
      if (!driver.capabilities.transactions) {
        // ponytail: on D1 the references are read before the batch runs; one added in between is left dangling (it reads as null)
        await db.batch(await deletion(db, name, id))
      }
      else {
        await db.transaction(async (tx: Db) => {
          for (const statement of await deletion(tx, name, id))
            await statement
        })
      }
      forgetRedirects()
      committed({ type: name, id, action: 'deleted', live: true })(undefined)
      await after('afterDelete', acting)
    },

    /** Where a shared block is used, in drafts and on the live site (each place once). */
    async sharedUsage(id: string): Promise<Reference[]> {
      const seen = new Map<string, Reference>()
      for (const stage of Object.values(stages)) {
        const rows: { source: string, sourceId: string, field: string }[] = await db.select().from(stage.relations)
          .where(and(eq(stage.relations.target, SHARED_BLOCKS), eq(stage.relations.targetId, id)))
        for (const row of rows)
          seen.set(`${row.source}:${row.sourceId}:${row.field}`, { collection: row.source, id: row.sourceId, field: row.field })
      }
      return [...seen.values()]
    },

    /**
     * Lets go of a shared block everywhere it's used, in drafts and live pages alike and without new versions:
     * `detach` puts a copy of its content in place of each reference (pages look the same), `remove` drops
     * the references. Afterwards it can be deleted. Answers the entries changed.
     */
    async releaseShared(id: string, mode: 'detach' | 'remove'): Promise<Reference[]> {
      const usage = await this.sharedUsage(id)
      const work = async (q: Db) => {
        const writes: unknown[] = []
        for (const stage of Object.values(stages)) {
          // each stage's copy: the published shared block for live pages, the draft for drafts
          const shared = (await stage.readMany(q, SHARED_BLOCKS, [id])).get(id) ?? (await stages.draft.readMany(q, SHARED_BLOCKS, [id])).get(id)
          const block = (shared?.data.block as BlockInstance[] | undefined)?.[0]
          const holders = new Map(usage.map(u => [`${u.collection}:${u.id}`, u]))
          for (const { collection: source, id: sourceId } of holders.values()) {
            const singletonHolder = !!schema.singletons[source]
            const entry = singletonHolder ? await stage.readSingleton(q, source, keyLocale(sourceId)) : await stage.read(q, source, sourceId)
            if (!entry)
              continue
            const data = replaceShared(entry.data, id, ref => mode === 'detach' && block ? { ...copyBlocks(block), id: ref.id } : undefined)
            const fields = singletonHolder ? stage.singleton(source).fields : stage.collection(source).definition.fields
            const changed = Object.keys(fields).filter(key => JSON.stringify(data[key]) !== JSON.stringify(entry.data[key]))
            if (!changed.length)
              continue
            if (singletonHolder)
              writes.push(q.update(stage.singletons).set({ data }).where(eq(stage.singletons.name, rowName(source, keyLocale(sourceId)))))
            else
              writes.push(q.update(stage.collection(source).table).set(toRow(Object.fromEntries(changed.map(key => [key, fields[key]!])), data)).where(eq(stage.collection(source).table._id, sourceId)))
            // its links again: the copy may use media
            const links = [...relationRows(fields, data), ...mediaRows(fields, data, schema.blocks), ...sharedRows(data)]
            writes.push(q.delete(stage.relations).where(and(eq(stage.relations.source, source), eq(stage.relations.sourceId, sourceId))))
            writes.push(...insertsOf(q, stage.relations, links.map(l => ({ source, sourceId, ...l }))))
          }
        }
        return writes
      }
      if (!driver.capabilities.transactions) {
        const writes = await work(db)
        if (writes.length)
          await db.batch(writes)
      }
      else {
        await db.transaction(async (tx: Db) => {
          for (const statement of await work(tx))
            await statement
        })
      }
      const changed = [...new Map(usage.map(u => [`${u.collection}:${u.id}`, u])).values()]
      for (const { collection: type, id: entryId } of changed)
        committed({ type, id: entryId, action: 'saved', live: true })(undefined)
      return changed
    },

    /**
     * A singleton (relations as ids, or entries up to `depth` levels), or undefined before its first save or
     * publish. A localized one in `locale` (the default locale when none), as for entries: missing, the first
     * of its fallback locales that has it; translated fields left empty filled from the next ones (`fallbacks`).
     */
    async getSingleton(name: string, options: GetOptions = {}): Promise<SingletonEntry | undefined> {
      const stageName = options.stage ?? 'published'
      const stage = stages[stageName]
      const [found] = await reading<SingletonEntry>({ type: name, id: name, stage: stageName }, async () => {
        let entry: SingletonEntry | undefined
        if (!localizedSingleton(name)) {
          entry = await stage.readSingleton(db, name)
        }
        else {
          const requested = options.locale ?? locales.default
          const chain = options.fallback === false ? [requested] : fallbackChain(locales, requested)
          const versions = await Promise.all(chain.map(l => stage.readSingleton(db, name, l)))
          const first = versions.findIndex(Boolean)
          if (first >= 0) {
            entry = versions[first]!
            const data = { ...entry.data }
            const fallbacks: Record<string, string> = {}
            for (const [key, field] of Object.entries(singleton(name).fields)) {
              if (field.shared || !isEmpty(data[key]))
                continue
              const later = versions.slice(first + 1).findIndex(v => v && !isEmpty(v.data[key]))
              if (later >= 0) {
                data[key] = versions[first + 1 + later]!.data[key]
                fallbacks[key] = chain[first + 1 + later]!
              }
            }
            entry = { ...entry, data, fallbacks }
          }
        }
        return entry ? [{ ...entry, data: (await stage.linked(await stage.populate(db, singleton(name).fields, [entry.data], options.depth ?? 0)))[0]! }] : []
      })
      return found
    },

    /**
     * Saves a singleton's draft atomically, as `save`. `version` is the one read, or undefined/null for the
     * first save; a localized one's in `locale`, its shared fields copied to its other locales' drafts as new versions.
     */
    async saveSingleton(name: string, input: { data: Record<string, unknown>, version?: number | null, authorId?: string, publish?: boolean, locale?: string }): Promise<SingletonEntry> {
      const live = !!input.publish || !versioned(name)
      const target = singletonTarget(name, input.version ?? undefined, input.authorId, input.locale)
      const entry = await hooked(target, input.data, input.publish, data => persist(target, data, input.publish).finally(forgetRedirects)
        .then(committed({ type: name, id: name, action: live ? 'published' : 'saved', live })))
      const shared = Object.entries(singleton(name).fields).filter(([, f]) => f.shared).map(([key]) => key)
      if (localizedSingleton(name) && shared.length) {
        for (const code of locales.codes.filter(c => c !== entry.locale)) {
          const other = await stages.draft.readSingleton(db, name, code)
          if (!other || shared.every(key => JSON.stringify(other.data[key]) === JSON.stringify(entry.data[key])))
            continue
          const data = { ...other.data, ...Object.fromEntries(shared.map(key => [key, entry.data[key]])) }
          // into drafts, as for entries: each locale's version is published on its own
          await persist(singletonTarget(name, other.version, input.authorId, code), data).finally(forgetRedirects)
            .then(committed({ type: name, id: name, action: versioned(name) ? 'saved' : 'published', live: !versioned(name) }))
        }
      }
      return entry
    },

    /** Publishes a singleton's draft (a localized one's in `locale`), as `publish`. */
    async publishSingleton(name: string, input: { version: number, authorId?: string, locale?: string }): Promise<SingletonEntry> {
      assertVersioned(name)
      const draft = await stages.draft.readSingleton(db, name, input.locale)
      if (!draft)
        throw new NotFoundError(`Singleton "${name}" has no saved draft${input.locale ? ` in ${input.locale}` : ''}`)
      const acting = { type: name, id: name, actorId: input.authorId ?? null }
      await before('beforePublish', { ...acting, version: input.version + 1 })
      const entry = await persist(singletonTarget(name, input.version, input.authorId, input.locale), draft.data, true).finally(forgetRedirects)
        .then(committed({ type: name, id: name, action: 'published', live: true }))
      await after('afterPublish', { ...acting, version: entry.version })
      return entry
    },

    /** Takes a singleton (a localized one in `locale`) off the site, as `unpublish`. */
    unpublishSingleton: (name: string, actorId: string | null = null, locale?: string) => unpublish(singletonTarget(name, undefined, undefined, locale), actorId),

    /**
     * The entry a site path belongs to: a canonical path (see canonicalPath), in `locale` when given, among
     * published URLs by default. A path shared by every locale matches any; without a locale, a shared path
     * wins over a per-locale one.
     */
    async resolve(path: string, locale?: string, stage: Stage = 'published'): Promise<ResolvedRoute | undefined> {
      const routes = stages[stage].routes
      // this site's paths, and shared types' (served on every site)
      const rows: { path: string, locale: string, source: string, sourceId: string }[] = await db.select().from(routes).where(and(eq(routes.path, path), visibleSites(routes)))
      const row = locale === undefined
        ? rows.find(r => r.locale === '') ?? rows[0]
        : rows.find(r => r.locale === locale) ?? rows.find(r => r.locale === '')
      if (!row || !(schema.collections[row.source] ?? schema.singletons[row.source])?.route)
        return undefined // a type no longer routable
      return { path: row.path, locale: row.locale, kind: row.source in schema.singletons ? 'singleton' : 'collection', name: row.source, id: row.sourceId }
    },

    redirects: {
      /** Every redirect, oldest first. */
      list: readRedirects,

      /** Every redirect, from a cache refreshed every 30 s and after this instance's writes: for serving requests. */
      cached(): Promise<Redirect[]> {
        if (!redirectCache || Date.now() - redirectCache.at > REDIRECT_TTL) {
          const list = readRedirects()
          redirectCache = { at: Date.now(), list }
          list.catch(forgetRedirects) // never keep a failed read
        }
        return redirectCache.list
      },

      /**
       * Creates or updates a redirect (`id` to update). Throws ValidationError (422) for an invalid source or
       * target, a source in use or that is an entry's URL, or a loop; NotFoundError for an unknown id.
       */
      async save(input: { id?: string, source: string, target: string, status?: number }): Promise<Redirect> {
        const status = (input.status ?? 301) as Redirect['status']
        const errors: FieldError[] = []
        const sourceError = sourceProblem(input.source)
        if (sourceError)
          errors.push({ path: 'source', message: sourceError })
        const targetError = sourceError ? undefined : targetProblem(input.source, input.target)
        if (targetError)
          errors.push({ path: 'target', message: targetError })
        if (!REDIRECT_STATUSES.includes(status))
          errors.push({ path: 'status', message: `Use one of ${REDIRECT_STATUSES.join(', ')}` })
        if (errors.length)
          throw new ValidationError(errors)
        const all = await readRedirects()
        if (input.id !== undefined && !all.some(r => r.id === input.id))
          throw new NotFoundError(`No redirect "${input.id}"`)
        const redirect: Redirect = { id: input.id ?? crypto.randomUUID(), source: input.source, target: input.target, status, auto: false }
        const same = all.find(r => r.source === redirect.source && r.id !== redirect.id)
        if (same)
          throw new ValidationError([{ path: 'source', message: `${redirect.source} already redirects to ${same.target}` }])
        const routes = stages.published.routes
        const [entry]: { source: string, sourceId: string }[] = await db.select().from(routes).where(and(eq(routes.path, redirect.source), visibleSites(routes))).limit(1)
        if (entry)
          throw new ValidationError([{ path: 'source', message: `${redirect.source} is the URL of ${entry.source in schema.singletons ? `singleton "${entry.source}"` : `entry "${entry.sourceId}" in "${entry.source}"`}; it can't redirect` }])
        const loop = redirectLoop(all, redirect)
        if (loop)
          throw new ValidationError([{ path: 'target', message: `This would make a loop: ${loop.join(' → ')}` }])
        if (input.id === undefined)
          await db.insert(redirectsTable).values({ ...redirect, createdAt: new Date().toISOString(), ...redirectSiteColumn() })
        else
          await db.update(redirectsTable).set({ source: redirect.source, target: redirect.target, status, auto: false }).where(and(eq(redirectsTable.id, redirect.id), redirectSite()))
        forgetRedirects()
        return redirect
      },

      async delete(id: string): Promise<void> {
        const [found] = await db.select({ id: redirectsTable.id }).from(redirectsTable).where(and(eq(redirectsTable.id, id), redirectSite())).limit(1)
        if (!found)
          throw new NotFoundError(`No redirect "${id}"`)
        await db.delete(redirectsTable).where(and(eq(redirectsTable.id, id), redirectSite()))
        forgetRedirects()
      },
    },

    /**
     * Deletes old revisions: each entry keeps its newest `keep`, every revision since `olderThan`, in
     * versioned types every revision that was published, and the versions in `pinned` (scheduled to be
     * published). Returns how many were deleted.
     */
    async pruneRevisions(policy: { keep: number, olderThan: Date, pinned?: { source: string, sourceId: string, version: number }[] }): Promise<number> {
      const cutoff = policy.olderThan.toISOString()
      // the entries with more than `keep`; then, per entry, its versions below its newest `keep`
      const crowded: { source: string, sourceId: string, newest: number }[] = await db
        .select({ source: revisions.source, sourceId: revisions.sourceId, newest: sql<number>`max(${revisions.version})` })
        .from(revisions)
        .groupBy(revisions.source, revisions.sourceId)
        .having(sql`count(*) > ${policy.keep}`)
      let deleted = 0
      for (const { source, sourceId, newest } of crowded) {
        const kept = versioned(source) ? eq(revisions.published, false) : undefined
        const pinned = (policy.pinned ?? []).filter(p => p.source === source && p.sourceId === sourceId).map(p => p.version)
        deleted += affected(await db.delete(revisions).where(and(
          pinned.length ? notInArray(revisions.version, pinned) : undefined,
          eq(revisions.source, source),
          eq(revisions.sourceId, sourceId),
          lte(revisions.version, Number(newest) - policy.keep),
          lt(revisions.createdAt, cutoff),
          kept,
        )))
      }
      return deleted
    },

    /** One saved version of an entry (or a singleton, by its name), or undefined. */
    /** Whether this site has the entry (any singleton: each site has its own, or shares one). */
    async owns(name: string, id: string): Promise<boolean> {
      return name in schema.singletons || !scopedType(name) || !!(await stages.draft.readMany(db, name, [id])).get(id)
    },

    async revision(name: string, id: string, version: number): Promise<{ version: number, createdAt: string, authorId: string | null, published: boolean, data: Record<string, unknown> } | undefined> {
      if (!await this.owns(name, id))
        return undefined
      id = recordId(name, id)
      const [row] = await db.select({ version: revisions.version, createdAt: revisions.createdAt, authorId: revisions.authorId, published: revisions.published, data: revisions.data }).from(revisions)
        .where(and(eq(revisions.source, name), eq(revisions.sourceId, id), eq(revisions.version, version))).limit(1)
      return row && { ...row, published: Boolean(row.published) }
    },

    /** Versions saved for an entry (or a singleton, by its name), newest first. */
    async revisions(name: string, id: string = name): Promise<{ version: number, createdAt: string, authorId: string | null, published: boolean, data: Record<string, unknown> }[]> {
      if (!await this.owns(name, id))
        return []
      id = recordId(name, id)
      const rows: { version: number, createdAt: string, authorId: string | null, published: unknown, data: Record<string, unknown> }[] = await db.select({ version: revisions.version, createdAt: revisions.createdAt, authorId: revisions.authorId, published: revisions.published, data: revisions.data }).from(revisions)
        .where(and(eq(revisions.source, name), eq(revisions.sourceId, id)))
        .orderBy(sql`${revisions.version} desc`)
      return rows.map(r => ({ ...r, published: Boolean(r.published) }))
    },
  }
}

export type EntryStore = ReturnType<typeof createEntryStore>
