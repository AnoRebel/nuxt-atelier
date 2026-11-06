import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setup } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { query } from './env'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'

const rootDir = fileURLToPath(new URL('../fixtures/dev-migrate', import.meta.url))
const notes = join(rootDir, 'server/atelier/collections/notes.ts')
const migrations = join(rootDir, 'server/atelier/migrations/sqlite')
const original = readFileSync(notes, 'utf8')
const url = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-dev-')), 'db.sqlite')}`
const defineNotes = (fields: string) => writeFileSync(notes, original.replace('title: text()', fields))

// a fresh connection each time: another process (the dev server) alters the table
async function columns(): Promise<string[]> {
  const driver = await connect(url, { loaders: allDrivers })
  try {
    return (await query(driver, sql`select name from pragma_table_info('atelier_c_notes')`)).map(r => r.name)
  }
  finally {
    await driver.close()
  }
}

async function until(check: () => Promise<boolean>, timeout = 60_000) {
  const end = Date.now() + timeout
  while (!await check()) {
    if (Date.now() > end)
      throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

describe('migrations in dev', async () => {
  process.env.NUXT_ATELIER_DATABASE_URL = url
  rmSync(migrations, { recursive: true, force: true })
  // registered before setup(): after-all hooks run in reverse, so this runs once the dev server has stopped
  // (restoring the file while it runs would trigger another dev migration)
  afterAll(() => {
    writeFileSync(notes, original)
    rmSync(join(rootDir, 'server/atelier/migrations'), { recursive: true, force: true })
    delete process.env.NUXT_ATELIER_DATABASE_URL
  })
  await setup({ setupTimeout: 300_000, rootDir, dev: true })

  it('creates the tables on start', async () => {
    await until(async () => (await columns()).includes('title'))
    expect(readdirSync(migrations)).toHaveLength(1)
  })

  it('applies an added field without manual steps', async () => {
    defineNotes('title: text(), body: text()')
    await until(async () => (await columns()).includes('body'))
    expect(readdirSync(migrations)).toHaveLength(2)
  })

  it('leaves a removed field\'s column (and data) until the drop is confirmed', async () => {
    defineNotes('body: text()')
    await new Promise(resolve => setTimeout(resolve, 5000))
    expect(await columns()).toContain('title')
    expect(readdirSync(migrations)).toHaveLength(2)
  })
})
