// Entry reads and saves. A save writes the entry row, its relation rows and a revision snapshot in one
// transaction: all of it persists or none does. Writes carry the version the client last read; a write
// against an older version is refused with a 409 rather than overwriting someone else's save.
import type { Field, FieldError, RelationField } from '../../shared/fields'
import type { EntryPath } from '../routes'
import type { CollectionDefinition, RouteDefinition } from '../types'
import type { AtelierDriver } from './driver'
import type { Db } from './entries'
import type { ContentSchema } from './tables'
import type { ListQuery } from './query'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { validateEntry } from '../../shared/fields'
import { entryPaths, MAX_PATH, patterns, presentPaths } from '../routes'
import { UnsupportedOperationError } from './driver'
import { fromRow, getRow, isUnique, toRow } from './entries'
import { afterCursor, compileFilter, compileSort, decodeCursor, encodeCursor, orderBy } from './query'
import { buildTables, collectionTable } from './tables'

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

export class NotFoundError extends Error {
  readonly statusCode = 404
}

/** An entry that references the one being deleted, through a relation field that restricts deletes. */
export interface Reference { collection: string, id: string, field: string }

/** The entry can't be deleted while `references` point to it. */
export class ReferencedError extends Error {
  readonly statusCode = 409
  readonly data: { references: Reference[] }
  constructor(what: string, readonly references: Reference[]) {
    super(`Can't delete ${what}: it's referenced by ${references.map(r => `${r.collection} "${r.id}" (${r.field})`).join(', ')}. Remove those references first, or set onDelete on the relation field.`)
    this.data = { references }
  }
}

export interface GetOptions {
  /** How many levels of relations to replace with the entries they point to. 0 (the default) keeps ids. */
  depth?: number
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
  /** Only entries this user created (own-entries-only permissions). */
  createdBy?: string
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
  data: Record<string, unknown>
}

export interface SaveInput {
  /** Omit to create an entry. */
  id?: string
  data: Record<string, unknown>
  /** Required when updating: the version the client last read. */
  version?: number
  authorId?: string
}

interface RelationRow { field: string, position: number, target: string, targetId: string }

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

/** Rows a statement changed, whatever the driver's result shape. */
function affected(result: unknown): number {
  const r = (Array.isArray(result) ? result[0] : result) as { rowsAffected?: number, rowCount?: number, affectedRows?: number }
  return r.rowsAffected ?? r.rowCount ?? r.affectedRows ?? 0
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

export function createEntryStore(driver: AtelierDriver, schema: ContentSchema, options: { maxNestingDepth?: number } = {}) {
  const tables = buildTables(driver.dialect, schema)
  const db = driver.db as Db
  const { atelier_relations: relations, atelier_revisions: revisions, atelier_routes: routes, atelier_singletons: singletons } = tables

  function collection(name: string): { definition: CollectionDefinition, table: Db } {
    const definition = schema.collections[name]
    if (!definition)
      throw new NotFoundError(`No collection "${name}"`)
    return { definition, table: tables[collectionTable(name)] }
  }

  function singleton(name: string) {
    const definition = schema.singletons[name]
    if (!definition)
      throw new NotFoundError(`No singleton "${name}"`)
    return definition
  }

  const CHUNK = 500 // ids per IN list, well under every engine's parameter limit

  /** Entries by id, with their relations: two queries per 500 ids. Missing ids are absent. */
  async function readMany(q: Db, name: string, ids: string[]): Promise<Map<string, Entry>> {
    const { definition, table } = collection(name)
    const found = new Map<string, Entry>()
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = [...new Set(ids.slice(i, i + CHUNK))]
      const rows: Record<string, unknown>[] = await q.select().from(table).where(inArray(table._id, chunk))
      if (!rows.length)
        continue
      const links: (RelationRow & { sourceId: string })[] = await q.select().from(relations)
        .where(and(eq(relations.source, name), inArray(relations.sourceId, rows.map(r => r._id as string))))
        .orderBy(asc(relations.sourceId), asc(relations.field), asc(relations.position))
      const urls = await storedPaths(q, name, definition.route, rows.map(r => r._id as string))
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
          ...definition.route && presentPaths(definition.route, urls.get(id) ?? []),
          data,
        })
      }
    }
    return found
  }

  const read = async (q: Db, name: string, id: string) => (await readMany(q, name, [id])).get(id)

  /** The stored paths of routable entries, by entry id: one query, none when not routable. */
  async function storedPaths(q: Db, source: string, route: RouteDefinition | undefined, ids: string[]): Promise<Map<string, EntryPath[]>> {
    const byId = new Map<string, EntryPath[]>()
    if (!route || !ids.length)
      return byId
    const rows: { path: string, locale: string, sourceId: string }[] = await q.select().from(routes)
      .where(and(eq(routes.source, source), inArray(routes.sourceId, ids)))
    for (const row of rows)
      byId.set(row.sourceId, [...byId.get(row.sourceId) ?? [], { path: row.path, locale: row.locale }])
    return byId
  }

  async function readSingleton(q: Db, name: string): Promise<SingletonEntry | undefined> {
    const [row] = await q.select().from(singletons).where(eq(singletons.name, name)).limit(1)
    if (!row)
      return undefined
    const { route, fields } = singleton(name)
    const urls = route ? (await storedPaths(q, name, route, [name])).get(name) ?? [] : []
    return { name, version: row.version, updatedAt: row.updatedAt, ...route && presentPaths(route, urls), data: renamed(fields, row.data) }
  }

  const routeOf = (source: string): RouteDefinition | undefined => (schema.collections[source] ?? schema.singletons[source])?.route

  interface RouteRow extends EntryPath { source: string, sourceId: string }
  /** The route rows an entry's save replaces: its own and, for nested routes, every entry below it. */
  interface PathPlan { source: string, ids: string[], rows: RouteRow[] }

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

  /**
   * The route rows for saving `data` to an entry: its paths, under its parent's for a nested route, and
   * when it already exists, the recomputed paths of every entry below it. 422 when it would be its own ancestor.
   */
  async function planPaths(q: Db, source: string, sourceId: string, data: Record<string, unknown>, existing: boolean): Promise<PathPlan | undefined> {
    const route = routeOf(source)
    if (!route)
      return undefined
    let own = entryPaths(route, data)
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
        .where(and(eq(routes.source, source), eq(routes.sourceId, data[key] as string)))
      own = under(own, parent)
    }
    const plan: PathPlan = { source, ids: [sourceId], rows: own.map(p => ({ ...p, source, sourceId })) }
    if (key && existing) {
      const walk = async (id: string, paths: EntryPath[], depth: number) => {
        for (const child of await childrenOf(q, source, key, id)) {
          if (plan.ids.includes(child.id) || depth >= MAX_DEPTH)
            continue
          const childPaths = under(entryPaths(route, child.data), paths)
          plan.ids.push(child.id)
          plan.rows.push(...childPaths.map(p => ({ ...p, source, sourceId: child.id })))
          await walk(child.id, childPaths, depth + 1)
        }
      }
      await walk(sourceId, own, 0)
    }
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
    const taken: RouteRow[] = await q.select().from(routes).where(inArray(routes.path, [...new Set(plan.rows.map(p => p.path))]))
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

  /** The statements replacing the stored route rows with a plan's. */
  function pathStatements(q: Db, plan: PathPlan | undefined): unknown[] {
    if (!plan)
      return []
    const rows = plan.rows.filter(r => r.path.length <= MAX_PATH)
    return [
      q.delete(routes).where(and(eq(routes.source, plan.source), inArray(routes.sourceId, plan.ids))),
      ...rows.length ? [q.insert(routes).values(rows)] : [],
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
    const items = pageRows.map(r => found.get(r.id as string)!).filter(Boolean)
    const populated = await populate(db, definition.fields, items.map(e => e.data), options.depth ?? 0)
    const last = pageRows.at(-1)
    return {
      items: items.map((entry, i) => ({ ...entry, data: populated[i]! })),
      total: Number(count),
      next: more && last ? encodeCursor(keys.map((_, i) => last[`k${i}`] ?? null)) : null,
    }
  }

  interface Target<T> {
    what: string // for messages: `entry "<id>" in "articles"`
    fields: Record<string, Field>
    source: string
    sourceId: string
    /** The version the client read; undefined creates. */
    expected: number | undefined
    authorId: string | undefined
    isUnique?: (q: Db) => (field: string, value: unknown) => Promise<boolean>
    currentVersion: (q: Db) => Promise<number | undefined>
    /** The insert, or the update guarded by the expected version. */
    write: (q: Db, data: Record<string, unknown>, version: number, now: string) => unknown
    read: (q: Db) => Promise<T>
  }

  function entryTarget(name: string, id: string, expected: number | undefined, authorId?: string): Target<Entry> {
    const { definition, table } = collection(name)
    return {
      what: `entry "${id}" in "${name}"`,
      fields: definition.fields,
      source: name,
      sourceId: id,
      expected,
      authorId,
      isUnique: q => (field, value) => isUnique(q, table, field, value, id),
      currentVersion: async q => (await q.select({ version: table._version }).from(table).where(eq(table._id, id)))[0]?.version,
      write: (q, data, version, now) => {
        const row = toRow(definition.fields, data)
        return expected === undefined
          ? q.insert(table).values({ _id: id, _version: version, _createdAt: now, _updatedAt: now, _createdBy: authorId ?? null, ...row })
          // only the version the client read is updated: a concurrent save makes this match nothing
          : q.update(table).set({ ...row, _version: version, _updatedAt: now }).where(and(eq(table._id, id), eq(table._version, expected)))
      },
      read: async q => (await read(q, name, id))!,
    }
  }

  function singletonTarget(name: string, expected: number | undefined, authorId?: string): Target<SingletonEntry> {
    return {
      what: `singleton "${name}"`,
      fields: singleton(name).fields,
      source: name,
      sourceId: name,
      expected,
      authorId,
      currentVersion: async q => (await readSingleton(q, name))?.version,
      write: (q, data, version, now) => expected === undefined
        ? q.insert(singletons).values({ name, data, version, updatedAt: now })
        : q.update(singletons).set({ data, version, updatedAt: now }).where(and(eq(singletons.name, name), eq(singletons.version, expected))),
      read: async q => (await readSingleton(q, name))!,
    }
  }

  /** The write, its relation rows and its revision, as unexecuted statements. */
  function statements(q: Db, target: Target<unknown>, data: Record<string, unknown>, now: string, plan?: PathPlan) {
    const { source, sourceId, expected } = target
    const version = expected === undefined ? 1 : expected + 1
    const links = relationRows(target.fields, data)
    return [
      target.write(q, data, version, now),
      ...expected === undefined ? [] : [q.delete(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId)))],
      ...links.length ? [q.insert(relations).values(links.map(l => ({ source, sourceId, ...l })))] : [],
      ...pathStatements(q, plan),
      // unique per (source, version): a stale save always collides with the winning save's revision
      q.insert(revisions).values({ id: crypto.randomUUID(), source, sourceId, version, data, createdAt: now, authorId: target.authorId ?? null }),
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
      result.push(...statements(q, entryTarget(e.source, e.id, e.version, target.authorId), e.data, now, await sidePlan(q, e.source, e.id, e.data)))
    return result
  }

  /**
   * Saves validated data, its relation rows and a revision atomically: in a transaction, or on D1 as
   * one batch whose revision insert (unique per source and version) doubles as the version check.
   */
  async function persist<T>(target: Target<T>, input: Record<string, unknown>): Promise<T> {
    const creating = target.expected === undefined
    const now = new Date().toISOString()

    const validate = async (q: Db) => {
      const result = await validateEntry(target.fields, input, { isUnique: target.isUnique?.(q), blocks: schema.blocks, maxNestingDepth: options.maxNestingDepth })
      if (!result.success)
        throw new ValidationError(result.errors)
      const plan = await planPaths(q, target.source, target.sourceId, result.value, !creating)
      await assertPathsFree(q, plan)
      return { data: result.value, plan }
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
        const { data, plan } = await validate(db)
        await refuseStale(db)
        await db.batch([...statements(db, target, data, now, plan), ...await mirrors(db, target, data, now)])
        return await target.read(db)
      }
      return await db.transaction(async (tx: Db) => {
        const { data, plan } = await validate(tx)
        const others = await mirrors(tx, target, data, now) // reads the links before this save replaces them
        const [write, ...rest] = statements(tx, target, data, now, plan)
        if (!affected(await write))
          await refuseStale(tx)
        for (const statement of [...rest, ...others])
          await statement
        return target.read(tx)
      })
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
    if (!await getRow(q, collection(name).table, id))
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
        q.delete(table).where(eq(table._id, sourceId)),
        q.delete(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId))),
        q.delete(routes).where(and(eq(routes.source, source), eq(routes.sourceId, sourceId))),
      )
    }
    for (const { source, sourceId, removed } of nullified.values()) {
      if (deleted.has(entryKey(source, sourceId)))
        continue
      const current = source in schema.singletons ? await readSingleton(q, source) : await read(q, source, sourceId)
      const target = source in schema.singletons ? singletonTarget(source, current!.version) : entryTarget(source, sourceId, current!.version)
      // not validated: removing a required reference leaves an entry that must be fixed on its next save
      const data = withoutRefs(target.fields, current!.data, removed)
      result.push(...statements(q, target, data, now, await sidePlan(q, source, sourceId, data)))
    }
    return result
  }

  return {
    /** An entry with its relations (as ids, or entries up to `depth` levels), or undefined. */
    async get(name: string, id: string, options: GetOptions = {}): Promise<Entry | undefined> {
      const entry = await read(db, name, id)
      return entry && { ...entry, data: (await populate(db, collection(name).definition.fields, [entry.data], options.depth ?? 0))[0]! }
    },

    /**
     * A page of entries: filtered, sorted and paginated (see ListQuery), populated to `depth`. Throws
     * QueryError (400) for a field or operator the collection can't use.
     */
    list,

    /**
     * Creates or updates an entry atomically. Throws ValidationError (422), ConflictError (409) when
     * `version` isn't the current one, or NotFoundError (404).
     */
    save(name: string, input: SaveInput): Promise<Entry> {
      collection(name)
      if (input.id !== undefined && input.version === undefined)
        throw new Error('Updating an entry needs the version it was read at')
      const target = entryTarget(name, input.id ?? crypto.randomUUID(), input.id === undefined ? undefined : input.version, input.authorId)
      return persist(target, input.data)
    },

    /**
     * Deletes an entry, applying the onDelete of every relation that references it, atomically.
     * Throws ReferencedError (409) listing the entries that restrict it, or NotFoundError (404).
     */
    async delete(name: string, id: string): Promise<void> {
      if (!driver.capabilities.transactions) {
        // ponytail: on D1 the references are read before the batch runs; one added in between is left dangling (it reads as null)
        await db.batch(await deletion(db, name, id))
        return
      }
      await db.transaction(async (tx: Db) => {
        for (const statement of await deletion(tx, name, id))
          await statement
      })
    },

    /** A singleton's saved data (relations as ids, or entries up to `depth` levels), or undefined before its first save. */
    async getSingleton(name: string, options: GetOptions = {}): Promise<SingletonEntry | undefined> {
      const entry = await readSingleton(db, name)
      return entry && { ...entry, data: (await populate(db, singleton(name).fields, [entry.data], options.depth ?? 0))[0]! }
    },

    /** Saves a singleton atomically. `version` is the one read, or undefined/null for the first save. */
    saveSingleton(name: string, input: { data: Record<string, unknown>, version?: number | null, authorId?: string }): Promise<SingletonEntry> {
      return persist(singletonTarget(name, input.version ?? undefined, input.authorId), input.data)
    },

    /**
     * The entry a site path belongs to: a canonical path (see canonicalPath), in `locale` when given.
     * A path shared by every locale matches any; without a locale, a shared path wins over a per-locale one.
     */
    async resolve(path: string, locale?: string): Promise<ResolvedRoute | undefined> {
      const rows: { path: string, locale: string, source: string, sourceId: string }[] = await db.select().from(routes).where(eq(routes.path, path))
      const row = locale === undefined
        ? rows.find(r => r.locale === '') ?? rows[0]
        : rows.find(r => r.locale === locale) ?? rows.find(r => r.locale === '')
      if (!row || !routeOf(row.source))
        return undefined // a type no longer routable
      return { path: row.path, locale: row.locale, kind: row.source in schema.singletons ? 'singleton' : 'collection', name: row.source, id: row.sourceId }
    },

    /** Versions saved for an entry (or a singleton, by its name), newest first. */
    async revisions(name: string, id: string = name): Promise<{ version: number, createdAt: string, data: Record<string, unknown> }[]> {
      return db.select({ version: revisions.version, createdAt: revisions.createdAt, data: revisions.data }).from(revisions)
        .where(and(eq(revisions.source, name), eq(revisions.sourceId, id)))
        .orderBy(sql`${revisions.version} desc`)
    },
  }
}

export type EntryStore = ReturnType<typeof createEntryStore>
