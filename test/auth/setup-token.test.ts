// First-run setup with NUXT_ATELIER_AUTH_SETUP_TOKEN: a public deploy isn't claimed by whoever finds it first.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/auth', import.meta.url))
const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-setup-token-')), 'db.sqlite')}`
const admin = { email: 'owner@example.com', password: 'password 123' }
const post = (body: unknown) => fetch('/api/_atelier/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('first-run setup with a setup token', async () => {
  await setup({ setupTimeout: 300_000, rootDir })

  beforeAll(async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: database, NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456', NUXT_ATELIER_AUTH_SETUP_TOKEN: 'the owner knows this' } })
  })

  it('asks for the token, and creates the administrator only with it', async () => {
    expect(await (await fetch('/api/_atelier/setup')).json()).toEqual({ needed: true, token: true })
    expect((await post(admin)).status).toBe(403)
    expect((await post({ ...admin, token: 'a guess' })).status).toBe(403)
    expect((await post({ ...admin, token: 'the owner knows this' })).status).toBe(200)
    expect(await (await fetch('/api/_atelier/setup')).json()).toEqual({ needed: false, token: true })
  })
})
