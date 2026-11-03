// Migration files under server/atelier/migrations/<dialect>/, applied with drizzle-orm's migrator.
// Applying needs no drizzle-kit; generating them does (src/cli/migrate.ts).
//
// Destructive statements (dropping or renaming a table or column) only run when the migration confirms
// each one with a comment line, which `atelier migrate generate --drop/--rename` writes:
//   -- atelier:confirm drop column atelier_c_articles.summary
import type { MigrationConfig } from 'drizzle-orm/migrator'
import type { AtelierDriver, Dialect } from './driver'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const MIGRATIONS_TABLE = 'atelier_migrations'

/** Where an app's migrations for a dialect live. */
export const migrationsFolder = (rootDir: string, dialect: Dialect) => join(rootDir, 'server', 'atelier', 'migrations', dialect)

const config = (folder: string): MigrationConfig => ({ migrationsFolder: folder, migrationsTable: MIGRATIONS_TABLE, migrationsSchema: 'public' })

const q = '[`"]?' // identifiers are quoted with backticks (SQLite, MySQL) or double quotes (Postgres)
const ident = `${q}(\\w+)${q}`
const DESTRUCTIVE: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(String.raw`ALTER TABLE ${ident} DROP COLUMN ${ident}`, 'gi'), m => `drop column ${m[1]}.${m[2]}`],
  [new RegExp(String.raw`DROP TABLE (?:IF EXISTS )?${ident}`, 'gi'), m => `drop table ${m[1]}`],
  [new RegExp(String.raw`ALTER TABLE ${ident} RENAME COLUMN ${ident} TO ${ident}`, 'gi'), m => `rename column ${m[1]}.${m[2]} to ${m[3]}`],
  [new RegExp(String.raw`ALTER TABLE ${ident} RENAME TO ${ident}`, 'gi'), m => `rename table ${m[1]} to ${m[2]}`],
  [new RegExp(String.raw`RENAME TABLE ${ident} TO ${ident}`, 'gi'), m => `rename table ${m[1]} to ${m[2]}`],
]

/**
 * The destructive changes in a migration, as `drop column <table>.<column>`-style descriptions.
 * SQLite alters a column by copying the table into `__new_<table>`, dropping the old one and renaming the
 * copy: that keeps the data, so it isn't reported.
 */
export function destructiveChanges(migration: string): string[] {
  const changes: string[] = []
  for (const [pattern, describe] of DESTRUCTIVE) {
    for (const m of migration.matchAll(pattern)) {
      const table = m[1]!
      const recreated = () => new RegExp(`INSERT INTO ${q}__new_${table}${q}`, 'i').test(migration)
      if (table.startsWith('__new_') || (/^DROP TABLE/i.test(m[0]) && recreated()))
        continue
      changes.push(describe(m as RegExpExecArray))
    }
  }
  return changes
}

const confirmations = (migration: string) => new Set([...migration.matchAll(/^--[ \t]*atelier:confirm (.+)$/gm)].map(m => m[1]!.trim()))

/** Destructive changes in a migration that it doesn't confirm. */
export const unconfirmedChanges = (migration: string) => {
  const confirmed = confirmations(migration)
  return destructiveChanges(migration).filter(change => !confirmed.has(change))
}

interface MigrationStatus {
  applied: string[]
  pending: string[]
}

/** The names of a folder's migrations, oldest first. */
export function localMigrationNames(folder: string): string[] {
  return existsSync(folder) ? readMigrationFiles(config(folder)).map(m => m.name) : []
}

async function rows(driver: AtelierDriver, query: SQL): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the dialects' raw query methods differ
  const db = driver.db as any
  if (driver.dialect === 'sqlite')
    return db.all(query)
  return driver.dialect === 'mysql' ? (await db.execute(query))[0] : (await db.execute(query)).rows
}

/**
 * Names of the applied migrations. Only a missing migrations table means "none": any other error
 * propagates, so a failed read can never make applied migrations look pending and run them again.
 */
async function appliedNames(driver: AtelierDriver): Promise<string[]> {
  const exists = driver.dialect === 'sqlite'
    ? sql`select 1 from sqlite_master where type = 'table' and name = ${MIGRATIONS_TABLE}`
    : driver.dialect === 'postgres'
      ? sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${MIGRATIONS_TABLE}`
      : sql`select 1 from information_schema.tables where table_schema = database() and table_name = ${MIGRATIONS_TABLE}`
  if (!(await rows(driver, exists)).length)
    return []
  const table = driver.dialect === 'postgres' ? sql`"public".${sql.identifier(MIGRATIONS_TABLE)}` : sql.identifier(MIGRATIONS_TABLE)
  return (await rows(driver, sql`select name from ${table}`)).map(r => r.name).filter((n): n is string => typeof n === 'string' && !!n)
}

/** Which of the named migrations the database has applied. */
export async function migrationStatus(driver: AtelierDriver, local: string[]): Promise<MigrationStatus> {
  const applied = new Set(await appliedNames(driver))
  return { applied: local.filter(n => applied.has(n)), pending: local.filter(n => !applied.has(n)) }
}

/**
 * Applies pending migrations. Refuses, before running anything, when one has an unconfirmed destructive change.
 * Returns the names it applied.
 */
export async function applyMigrations(driver: AtelierDriver, folder: string): Promise<string[]> {
  const { pending } = await migrationStatus(driver, localMigrationNames(folder))
  for (const name of pending) {
    const unconfirmed = unconfirmedChanges(readFileSync(join(folder, name, 'migration.sql'), 'utf8'))
    if (unconfirmed.length) {
      throw new Error(`[nuxt-atelier] Migration ${name} would ${unconfirmed.join(', ')} without confirmation. `
        + `If that's intended, add a line per change to its migration.sql:\n${unconfirmed.map(c => `  -- atelier:confirm ${c}`).join('\n')}`)
    }
  }
  if (!pending.length)
    return []
  const options = config(folder)
  if (driver.dialect === 'sqlite')
    await (await import('drizzle-orm/libsql/migrator')).migrate(driver.db, options)
  else if (driver.dialect === 'postgres')
    await (await import('drizzle-orm/node-postgres/migrator')).migrate(driver.db, options)
  else
    await (await import('drizzle-orm/mysql2/migrator')).migrate(driver.db, options)
  return pending
}
