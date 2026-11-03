// Database URLs for the storage tests. SQLite always runs; the server engines run when their URL is set
// (see test/compose.yml), and CI requires all of them so a missing service can't pass silently.
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'

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

export const engines: [name: string, url: string][] = [
  ['sqlite', `file:${join(mkdtempSync(join(tmpdir(), 'atelier-')), 'test.sqlite')}`],
  ...Object.entries(servers).filter((e): e is [string, string] => !!e[1]),
]

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
  const rows = await db.all(sql.raw(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`))
  for (const { name } of rows as { name: string }[])
    await db.run(sql.raw(`drop table \`${name}\``))
}
