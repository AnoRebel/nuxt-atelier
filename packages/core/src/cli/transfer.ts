// `atelier export` / `atelier import`: all content in a portable archive, across database engines.
//
// The archive is NDJSON (gzipped when the file name ends in .gz): a header line, then one line per row,
// `{"table":"atelier_c_articles","row":{...}}`. Rows are keyed by the table definitions' property names,
// not by raw driver values, so a SQLite export imports into Postgres or MySQL unchanged. Both directions
// stream in pages, so memory doesn't grow with the size of the content.
//
// Exported: entries of every collection, singletons, relations, revisions, routes and users (media
// metadata and other system tables join as their sections add them). Not exported: the migrations
// table, and sessions, which a restore signs out.
import type { Readable, Writable } from 'node:stream'
import type { AtelierDriver } from '../runtime/server/db/driver'
import type { Db } from '../runtime/server/db/entries'
import type { ContentSchema } from '../runtime/server/db/tables'
import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { getTableColumns, sql } from 'drizzle-orm'
import { withTransaction } from '../runtime/server/db/store'
import { buildTables } from '../runtime/server/db/tables'

const ARCHIVE_FORMAT = 'nuxt-atelier-export'
const ARCHIVE_VERSION = 1
const PAGE = 500

interface Header {
  format: typeof ARCHIVE_FORMAT
  version: number
  exportedAt: string
  dialect: string
  tables: string[]
}

/** The tables to transfer, in a fixed order: system tables, then one per collection. */
function contentTables(driver: AtelierDriver, schema: ContentSchema): [string, Db][] {
  const tables = buildTables(driver.dialect, schema)
  return Object.entries(tables).filter(([name]) => name !== 'atelier_sessions').toSorted(([a], [b]) => a.localeCompare(b))
}

/** Writes every content row to `out` as NDJSON. Returns the row count per table. */
async function exportContent(driver: AtelierDriver, schema: ContentSchema, out: Writable): Promise<Record<string, number>> {
  const db = driver.db as Db
  const tables = contentTables(driver, schema)
  const write = (line: unknown) => new Promise<void>((resolve, reject) =>
    out.write(`${JSON.stringify(line)}\n`, error => error ? reject(error) : resolve()))
  const header: Header = { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, exportedAt: new Date().toISOString(), dialect: driver.dialect, tables: tables.map(([name]) => name) }
  await write(header)

  const counts: Record<string, number> = {}
  for (const [name, table] of tables) {
    // a stable order over every column, so pages never skip or repeat a row
    // ponytail: offset paging is O(n²) on huge tables; switch to keyset paging if exports get slow
    const order = Object.values(getTableColumns(table))
    counts[name] = 0
    for (let offset = 0; ; offset += PAGE) {
      const rows: Record<string, unknown>[] = await db.select().from(table).orderBy(...order).limit(PAGE).offset(offset)
      for (const row of rows)
        await write({ table: name, row })
      counts[name] += rows.length
      if (rows.length < PAGE)
        break
    }
  }
  return counts
}

/**
 * Inserts an archive's rows into an empty database whose tables exist (`atelier migrate apply` first),
 * in one transaction: a failed import leaves the database empty. Returns the row count per table.
 */
export async function importContent(driver: AtelierDriver, schema: ContentSchema, input: Readable): Promise<Record<string, number>> {
  const tables = Object.fromEntries(contentTables(driver, schema))
  const lines = createInterface({ input, crlfDelay: Infinity })[Symbol.asyncIterator]()

  const first = await lines.next()
  const header = first.done ? undefined : JSON.parse(first.value) as Partial<Header>
  if (header?.format !== ARCHIVE_FORMAT)
    throw new Error('[nuxt-atelier] Not a Nuxt Atelier export: the first line has no export header')
  if (header.version !== ARCHIVE_VERSION)
    throw new Error(`[nuxt-atelier] This export is format version ${header.version}; this version of nuxt-atelier reads version ${ARCHIVE_VERSION}`)
  const missing = (header.tables ?? []).filter(name => !tables[name])
  if (missing.length)
    throw new Error(`[nuxt-atelier] The export has content for tables this app's schema doesn't define: ${missing.join(', ')}. Add the collections, or migrate, before importing.`)

  return withTransaction(driver, 'Importing content', async (tx: Db) => {
    for (const [name, table] of Object.entries(tables)) {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(table)
      if (Number(count) > 0)
        throw new Error(`[nuxt-atelier] Import needs an empty database, but ${name} has ${count} rows`)
    }
    const counts: Record<string, number> = {}
    let batch: { name: string, rows: Record<string, unknown>[] } = { name: '', rows: [] }
    const flush = async () => {
      if (batch.rows.length)
        await tx.insert(tables[batch.name]).values(batch.rows)
      batch.rows = []
    }
    for (let line = await lines.next(); !line.done; line = await lines.next()) {
      if (!line.value.trim())
        continue
      const { table, row } = JSON.parse(line.value) as { table: string, row: Record<string, unknown> }
      if (table !== batch.name || batch.rows.length >= PAGE) {
        await flush()
        batch = { name: table, rows: [] }
      }
      batch.rows.push(row)
      counts[table] = (counts[table] ?? 0) + 1
    }
    await flush()
    return counts
  })
}

const gzipped = (file: string) => file.endsWith('.gz')

/** Exports to a file (gzipped for a .gz name). */
export async function exportToFile(driver: AtelierDriver, schema: ContentSchema, file: string) {
  const out = createWriteStream(file)
  if (!gzipped(file)) {
    const counts = await exportContent(driver, schema, out)
    await new Promise(resolve => out.end(resolve))
    return counts
  }
  const gzip = createGzip()
  const done = pipeline(gzip, out)
  const counts = await exportContent(driver, schema, gzip)
  gzip.end()
  await done
  return counts
}

/** Imports from a file (gunzipped for a .gz name). */
export function importFromFile(driver: AtelierDriver, schema: ContentSchema, file: string) {
  const input = createReadStream(file)
  return importContent(driver, schema, gzipped(file) ? input.pipe(createGunzip()) : input)
}
