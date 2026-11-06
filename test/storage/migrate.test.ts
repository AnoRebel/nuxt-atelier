import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { query, resetDatabase, urlEngines } from './env'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'

const root = fileURLToPath(new URL('../fixtures/migrate', import.meta.url))
const cli = fileURLToPath(new URL('../../packages/core/dist/cli/index.mjs', import.meta.url))
const collections = join(root, 'server/atelier/collections')

function defineNotes(fields: string) {
  mkdirSync(collections, { recursive: true })
  writeFileSync(join(collections, 'notes.ts'), `import { defineCollection, text } from '#atelier/server'\nexport default defineCollection({ fields: { ${fields} } })\n`)
}

describe.each(urlEngines)('atelier migrate on %s', (_, url) => {
  let driver: AtelierDriver
  let migrations: string
  const atelier = async (...args: string[]) => {
    try {
      const { stdout } = await promisify(execFile)('node', [cli, 'migrate', ...args, '--root', root], { env: { ...process.env, NUXT_ATELIER_DATABASE_URL: url } })
      return { code: 0, output: stdout }
    }
    catch (error) {
      const { code, stdout, stderr } = error as { code: number, stdout: string, stderr: string }
      return { code, output: stdout + stderr }
    }
  }
  // a fresh connection: libSQL keeps serving `select *` with the columns it saw before another process altered the table
  const rows = async () => {
    const fresh = await connect(url, { loaders: allDrivers })
    try {
      return await query(fresh, sql`select * from atelier_c_notes`)
    }
    finally {
      await fresh.close()
    }
  }
  const latest = () => readFileSync(join(migrations, readdirSync(migrations).toSorted().at(-1)!, 'migration.sql'), 'utf8')

  beforeAll(async () => {
    driver = await connect(url, { loaders: allDrivers })
    await resetDatabase(driver)
    migrations = join(root, 'server/atelier/migrations', driver.dialect)
    rmSync(join(root, 'server/atelier'), { recursive: true, force: true })
  })
  afterAll(async () => {
    await driver?.close()
    rmSync(join(root, 'server/atelier'), { recursive: true, force: true })
  })

  it('generates and applies the first migration', async () => {
    defineNotes(`title: text(), summary: text()`)
    expect((await atelier('status')).output).toContain('Applied: 0')
    expect(await atelier('generate', '--name', 'init')).toMatchObject({ code: 0 })
    expect((await atelier('status')).output).toMatch(/Pending:\n\s+\d+_init/)
    expect((await atelier('apply')).output).toMatch(/Applied:\n\s+\d+_init/)
    expect((await atelier('apply')).output).toContain('up to date')
    await query(driver, sql`insert into atelier_c_notes (_id, _version, _created_at, _updated_at, title, summary) values ('n1', 1, 'now', 'now', 'Hello', 'Short')`)
    expect(await rows()).toMatchObject([{ title: 'Hello', summary: 'Short' }])
  })

  it('writes no drop for a removed field until it is confirmed', async () => {
    defineNotes(`title: text()`)
    const before = readdirSync(migrations).length
    const refused = await atelier('generate')
    expect(refused.code).toBe(1)
    expect(refused.output).toContain('drop column atelier_c_notes.summary: pass --drop notes.summary to delete its data, or --rename notes.summary=<new field> if it was renamed')
    expect(readdirSync(migrations)).toHaveLength(before)

    expect(await atelier('generate', '--drop', 'notes.summary')).toMatchObject({ code: 0 })
    expect(latest()).toMatch(/^-- atelier:confirm drop column atelier_c_notes\.summary\n/)
    expect((await atelier('apply')).output).toContain('Applied:')
    expect(await rows()).toEqual([expect.not.objectContaining({ summary: expect.anything() })])
  })

  it('keeps the data of a field declared as renamed', async () => {
    defineNotes(`heading: text()`)
    const refused = await atelier('generate')
    expect(refused.output).toContain('--rename notes.title=<new field>')

    expect(await atelier('generate', '--rename', 'notes.title=heading')).toMatchObject({ code: 0 })
    expect(latest()).toContain('-- atelier:confirm rename column atelier_c_notes.title to heading')
    expect((await atelier('apply')).output).toContain('Applied:')
    expect(await rows()).toMatchObject([{ heading: 'Hello' }])
  })

  it('refuses to apply a hand-written migration with an unconfirmed drop', async () => {
    const folder = join(migrations, '29990101000000_manual')
    mkdirSync(folder)
    writeFileSync(join(folder, 'migration.sql'), 'DROP TABLE atelier_c_notes;')
    writeFileSync(join(folder, 'snapshot.json'), readFileSync(join(migrations, readdirSync(migrations).toSorted().at(-2)!, 'snapshot.json')))
    const refused = await atelier('apply')
    expect(refused.code).toBe(1)
    expect(refused.output).toContain('-- atelier:confirm drop table atelier_c_notes')
    expect(await rows()).toHaveLength(1)
    rmSync(folder, { recursive: true })
  })

  it('reports no changes when the schema matches', async () => {
    expect((await atelier('generate')).output).toContain('No schema changes.')
  })
}, 300_000)
