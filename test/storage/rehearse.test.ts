// `atelier migrate apply --dry-run`: pending migrations run in a transaction that's always rolled back
import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rehearseMigrations } from '../../packages/core/src/runtime/server/db/migrations'
import { connectEngine, engines, query, resetDatabase } from './env'

const folder = mkdtempSync(join(tmpdir(), 'atelier-rehearse-'))
const migration = (name: string, statement: string) => {
  mkdirSync(join(folder, name), { recursive: true })
  writeFileSync(join(folder, name, 'migration.sql'), statement)
}
migration('20260101000000_add_table', 'CREATE TABLE atelier_rehearse_new (id integer)')
migration('20260101000001_unique', 'CREATE UNIQUE INDEX atelier_rehearse_x_idx ON atelier_rehearse (x)')
migration('20260101000002_after', 'CREATE TABLE atelier_rehearse_later (id integer)')

describe.each(engines)('%s migration rehearsal', (name, url) => {
  let driver: AtelierDriver
  const tables = async () => (await query(driver, name === 'postgres'
    ? sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_name like 'atelier_rehearse%'`
    : sql`select name from sqlite_master where type = 'table' and name like 'atelier_rehearse%'`)).map(r => r.name).toSorted()

  beforeAll(async () => {
    driver = await connectEngine(url)
    await resetDatabase(driver)
    await query(driver, sql`create table atelier_rehearse (x varchar(20))`)
    await query(driver, sql`insert into atelier_rehearse (x) values ('same'), ('same')`)
  }, 120_000)
  afterAll(() => driver?.close())

  it.runIf(name === 'sqlite' || name === 'postgres')('reports the migration that fails, runs none after it, and changes nothing', async () => {
    const results = await rehearseMigrations(driver, folder)
    expect(results.map(r => [r.name, r.result])).toEqual([
      ['20260101000000_add_table', 'ok'],
      ['20260101000001_unique', 'failed'],
      ['20260101000002_after', 'skipped'],
    ])
    expect((results[1] as { error: string }).error).toMatch(/unique|duplicate/i)
    expect(await tables()).toEqual(['atelier_rehearse']) // the first one's table was rolled back too
    // and nothing recorded as applied: rehearsing again gives the same
    expect((await rehearseMigrations(driver, folder)).map(r => r.result)).toEqual(['ok', 'failed', 'skipped'])
  })

  it.runIf(name !== 'sqlite' && name !== 'postgres')('is refused where schema changes can\'t be rolled back', async () => {
    await expect(rehearseMigrations(driver, folder)).rejects.toThrow(name === 'd1' ? /D1 doesn't have/ : /commit schema changes as they run/)
  })
})
