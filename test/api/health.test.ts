// Health endpoints: liveness answers while the database is down; readiness says what's wrong, with 503
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('health', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/api', import.meta.url)) })
  const get = async (path: string) => {
    const response = await fetch(`/api/_atelier/health/${path}`)
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }
  }
  const secret = 'a-test-secret-that-is-long-enough-123456'

  it('is ready with the database up and migrated', async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-health-')), 'db.sqlite')}`, NUXT_APP_SECRET: secret } })
    expect(await get('live')).toEqual({ status: 200, cache: 'no-store', body: { status: 'ok' } })
    expect(await get('ready')).toMatchObject({ status: 200, body: { status: 'ready', checks: { database: 'ok', migrations: { pending: 0 }, storage: 'ok', jobs: { failed: 0 } } } })
    // a correlation id on every response: the caller's, or a new one
    expect((await fetch('/api/_atelier/health/live', { headers: { 'x-request-id': 'lb-123' } })).headers.get('x-request-id')).toBe('lb-123')
    expect((await fetch('/api/_atelier/health/live', { headers: { 'x-request-id': 'bad id with spaces' } })).headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    // security headers: the CMS API is never framed or sniffed (the admin's are checked with its pages)
    const api = (await fetch('/api/_atelier/health/live')).headers
    expect([api.get('x-content-type-options'), api.get('x-frame-options'), api.get('referrer-policy')]).toEqual(['nosniff', 'DENY', 'same-origin'])
  })

  it('refuses to start in production without an app secret', async () => {
    const started = startServer({ env: { NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-health-')), 'db.sqlite')}`, NODE_ENV: 'production', TEST: '', NUXT_APP_SECRET: '' } })
    await expect(started).rejects.toThrow()
  })

  it('answers 503 for readiness, 200 for liveness, while the database is unreachable, and leaks no details', async () => {
    const url = 'postgres://atelier:hunter2-secret@127.0.0.1:1/atelier'
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: url, NUXT_APP_SECRET: secret } })
    expect((await get('live')).status).toBe(200)
    const ready = await get('ready')
    expect(ready).toMatchObject({ status: 503, body: { status: 'unavailable', checks: { database: 'error', migrations: 'error', jobs: 'error' } } })
    expect(JSON.stringify(ready.body)).not.toContain('hunter2')
  })
})
