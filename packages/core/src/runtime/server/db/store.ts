// Entry reads and saves. A save writes the entry row, its relation rows and a revision snapshot in one
// transaction: all of it persists or none does. Writes carry the version the client last read; a write
// against an older version is refused with a 409 rather than overwriting someone else's save.
import type { Field, FieldError } from '../../shared/fields'
import type { CollectionDefinition } from '../types'
import type { AtelierDriver } from './driver'
import type { Db } from './entries'
import type { ContentSchema } from './tables'
import { and, asc, eq, sql } from 'drizzle-orm'
import { validateEntry } from '../../shared/fields'
import { UnsupportedOperationError } from './driver'
import { fromRow, getRow, isUnique, toRow } from './entries'
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

export interface Entry {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  data: Record<string, unknown>
}

export interface SingletonEntry {
  name: string
  version: number
  updatedAt: string
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

export function createEntryStore(driver: AtelierDriver, schema: ContentSchema) {
  const tables = buildTables(driver.dialect, schema)
  const db = driver.db as Db
  const { atelier_relations: relations, atelier_revisions: revisions, atelier_singletons: singletons } = tables

  function collection(name: string): { definition: CollectionDefinition, table: Db } {
    const definition = schema.collections[name]
    if (!definition)
      throw new NotFoundError(`No collection "${name}"`)
    return { definition, table: tables[collectionTable(name)] }
  }

  async function read(tx: Db, name: string, id: string): Promise<Entry | undefined> {
    const { definition, table } = collection(name)
    const row = await getRow(tx, table, id)
    if (!row)
      return undefined
    const data = fromRow(definition.fields, row)
    const links: RelationRow[] = await tx.select().from(relations)
      .where(and(eq(relations.source, name), eq(relations.sourceId, id)))
      .orderBy(asc(relations.field), asc(relations.position))
    // top-level relations live only in the relations table; nested ones are also in their JSON column
    for (const [key, field] of Object.entries(definition.fields)) {
      if (field.type !== 'relation')
        continue
      const ids = links.filter(l => l.field === key).map(l => l.targetId)
      data[key] = field.many ? ids : ids[0] ?? null
    }
    return { id, version: row._version as number, createdAt: row._createdAt as string, updatedAt: row._updatedAt as string, data }
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

  /**
   * Saves validated data, its relation rows and a revision atomically: in a transaction, or on D1 as
   * one batch whose revision insert (unique per source and version) doubles as the version check.
   */
  async function persist<T>(target: Target<T>, input: Record<string, unknown>): Promise<T> {
    const creating = target.expected === undefined
    const version = creating ? 1 : target.expected! + 1
    const now = new Date().toISOString()
    const { source, sourceId } = target

    const validate = async (q: Db) => {
      const result = await validateEntry(target.fields, input, { isUnique: target.isUnique?.(q) })
      if (!result.success)
        throw new ValidationError(result.errors)
      return result.value
    }
    const statements = (q: Db, data: Record<string, unknown>) => {
      const links = relationRows(target.fields, data)
      return [
        target.write(q, data, version, now),
        ...creating ? [] : [q.delete(relations).where(and(eq(relations.source, source), eq(relations.sourceId, sourceId)))],
        ...links.length ? [q.insert(relations).values(links.map(l => ({ source, sourceId, ...l })))] : [],
        // unique per (source, version): a stale save always collides with the winning save's revision
        q.insert(revisions).values({ id: crypto.randomUUID(), source, sourceId, version, data, createdAt: now, authorId: target.authorId ?? null }),
      ]
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
        const data = await validate(db)
        await refuseStale(db)
        await db.batch(statements(db, data))
        return await target.read(db)
      }
      return await db.transaction(async (tx: Db) => {
        const [write, ...rest] = statements(tx, await validate(tx))
        if (!affected(await write))
          await refuseStale(tx)
        for (const statement of rest)
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

  async function readSingleton(q: Db, name: string): Promise<SingletonEntry | undefined> {
    const [row] = await q.select().from(singletons).where(eq(singletons.name, name)).limit(1)
    return row && { name, version: row.version, updatedAt: row.updatedAt, data: row.data }
  }

  function singleton(name: string) {
    const definition = schema.singletons[name]
    if (!definition)
      throw new NotFoundError(`No singleton "${name}"`)
    return definition
  }

  return {
    /** An entry with its relations, or undefined. */
    get: (name: string, id: string) => read(db, name, id),

    /**
     * Creates or updates an entry atomically. Throws ValidationError (422), ConflictError (409) when
     * `version` isn't the current one, or NotFoundError (404).
     */
    save(name: string, input: SaveInput): Promise<Entry> {
      const { definition, table } = collection(name)
      if (input.id !== undefined && input.version === undefined)
        throw new Error('Updating an entry needs the version it was read at')
      const id = input.id ?? crypto.randomUUID()
      return persist({
        what: `entry "${id}" in "${name}"`,
        fields: definition.fields,
        source: name,
        sourceId: id,
        expected: input.id === undefined ? undefined : input.version,
        authorId: input.authorId,
        isUnique: q => (field, value) => isUnique(q, table, field, value, id),
        currentVersion: async q => (await q.select({ version: table._version }).from(table).where(eq(table._id, id)))[0]?.version,
        write: (q, data, version, now) => {
          const row = toRow(definition.fields, data)
          return input.id === undefined
            ? q.insert(table).values({ _id: id, _version: version, _createdAt: now, _updatedAt: now, ...row })
            // only the version the client read is updated: a concurrent save makes this match nothing
            : q.update(table).set({ ...row, _version: version, _updatedAt: now }).where(and(eq(table._id, id), eq(table._version, input.version)))
        },
        read: async q => (await read(q, name, id))!,
      }, input.data)
    },

    /** A singleton's saved data, or undefined before its first save. */
    getSingleton: (name: string) => {
      singleton(name)
      return readSingleton(db, name)
    },

    /** Saves a singleton atomically. `version` is the one read, or undefined/null for the first save. */
    saveSingleton(name: string, input: { data: Record<string, unknown>, version?: number | null, authorId?: string }): Promise<SingletonEntry> {
      const definition = singleton(name)
      const expected = input.version ?? undefined
      return persist({
        what: `singleton "${name}"`,
        fields: definition.fields,
        source: name,
        sourceId: name,
        expected,
        authorId: input.authorId,
        currentVersion: async q => (await readSingleton(q, name))?.version,
        write: (q, data, version, now) => expected === undefined
          ? q.insert(singletons).values({ name, data, version, updatedAt: now })
          : q.update(singletons).set({ data, version, updatedAt: now }).where(and(eq(singletons.name, name), eq(singletons.version, expected))),
        read: async q => (await readSingleton(q, name))!,
      }, input.data)
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
