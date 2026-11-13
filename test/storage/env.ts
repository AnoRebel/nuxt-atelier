// Database URLs for the storage tests. SQLite and D1 (Miniflare's local D1) always run; the server engines
// run when their URL is set (see test/compose.yml), and CI requires all of them so a missing service can't
// pass silently.
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { Miniflare } from 'miniflare'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'

const servers = {
  postgres: process.env.ATELIER_TEST_POSTGRES_URL,
  mysql: process.env.ATELIER_TEST_MYSQL_URL,
  mariadb: process.env.ATELIER_TEST_MARIADB_URL,
}

if (process.env.CI) {
  const missing = Object.entries(servers).filter(([, url]) => !url).map(([name]) => name)
  if (missing.length)
    throw new Error(`CI must set ATELIER_TEST_*_URL for: ${missing.join(', ')}`)
}

/** Engines the CLI can reach by URL. */
export const urlEngines: [name: string, url: string][] = [
  ['sqlite', `file:${join(mkdtempSync(join(tmpdir(), 'atelier-')), 'test.sqlite')}`],
  ...Object.entries(servers).filter((e): e is [string, string] => !!e[1]),
]

/** Every engine, D1 included (it's a Worker binding, so only connectEngine can open it). */
export const engines: [name: string, url: string][] = [...urlEngines, ['d1', 'd1:DB']]

/** Opens any test engine; D1 gets a fresh local database from Miniflare, disposed on close. */
export async function connectEngine(url: string, options: { poolSize?: number, logQuery?: (query: string) => void } = {}): Promise<AtelierDriver> {
  if (!url.startsWith('d1:'))
    return connect(url, { loaders: allDrivers, ...options })
  const mf = new Miniflare({ modules: true, script: 'export default { fetch: () => new Response() }', d1Databases: ['DB'] })
  const driver = await connect(url, { loaders: allDrivers, d1: await mf.getD1Database('DB') as never, logQuery: options.logQuery })
  return { ...driver, close: () => mf.dispose() }
}

const pushScript = fileURLToPath(new URL('./push.ts', import.meta.url))

/** Creates the Atelier tables for a schema (a JSON file) with drizzle-kit; for D1, runs its SQL through the binding. */
export async function createTables(driver: AtelierDriver, url: string, schemaFile: string): Promise<void> {
  if (!url.startsWith('d1:')) {
    await promisify(execFile)('bun', [pushScript, driver.dialect, url, schemaFile])
    return
  }
  const { stdout } = await promisify(execFile)('bun', [pushScript, 'sqlite', 'export', schemaFile])
  for (const statement of JSON.parse(stdout) as string[])
    await (driver.db as any).run(sql.raw(statement))
}

/** Drops every table, so each run starts from an empty database. */
export async function resetDatabase(driver: AtelierDriver): Promise<void> {
  const db = driver.db as any
  if (driver.dialect === 'postgres') {
    await db.execute(sql.raw('drop schema public cascade; create schema public'))
    return
  }
  if (driver.dialect === 'mysql') {
    const [rows] = await db.execute(sql.raw('select table_name as name from information_schema.tables where table_schema = database()'))
    for (const { name } of rows as { name: string }[])
      await db.execute(sql.raw(`drop table \`${name}\``))
    return
  }
  // virtual tables (the FTS5 search index) first: dropping one drops its own tables, which can't be dropped alone
  for (const { name } of await db.all(sql.raw(`select name from sqlite_master where sql like 'CREATE VIRTUAL TABLE%'`)) as { name: string }[])
    await db.run(sql.raw(`drop table \`${name}\``))
  const rows = await db.all(sql.raw(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%'`))
  for (const { name } of rows as { name: string }[])
    await db.run(sql.raw(`drop table \`${name}\``))
}

/** Runs raw SQL on any dialect, returning the rows. */
export async function query(driver: AtelierDriver, statement: SQL): Promise<any[]> {
  const db = driver.db as any
  if (driver.dialect === 'sqlite')
    return db.all(statement)
  return driver.dialect === 'mysql' ? (await db.execute(statement))[0] : (await db.execute(statement)).rows
}
