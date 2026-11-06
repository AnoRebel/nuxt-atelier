import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { query } from './env'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'

const rootDir = fileURLToPath(new URL('../fixtures/pending', import.meta.url))
const cli = fileURLToPath(new URL('../../packages/core/dist/cli/index.mjs', import.meta.url))
const freshDatabase = () => `file:${join(mkdtempSync(join(tmpdir(), 'atelier-pending-')), 'db.sqlite')}`
const write = () => fetch('/api/write', { method: 'POST' })

async function tables(url: string) {
  const driver = await connect(url, { loaders: allDrivers })
  try {
    return (await query(driver, sql`select name from sqlite_master where type = 'table'`)).map(r => r.name)
  }
  finally {
    await driver.close()
  }
}

describe('migrations in production', async () => {
  await setup({ setupTimeout: 300_000, rootDir })

  it('refuses CMS writes while the bundled migrations are pending', async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: freshDatabase() } })
    const response = await write()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).toMatch(/1 pending migration \(\d+_init\)\. Run `atelier migrate apply`/)
  })

  it('applies them at startup with migrations.autoApply', async () => {
    const url = freshDatabase()
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: url, NUXT_ATELIER_MIGRATIONS_AUTO_APPLY: 'true' } })
    expect((await write()).status).toBe(200)
    expect(await tables(url)).toContain('atelier_c_notes')
  })

  it('accepts writes once `atelier migrate apply` has run', async () => {
    const url = freshDatabase()
    await promisify(execFile)('node', [cli, 'migrate', 'apply', '--root', rootDir], { env: { ...process.env, NUXT_ATELIER_DATABASE_URL: url } })
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: url } })
    expect((await write()).status).toBe(200)
  })
})
