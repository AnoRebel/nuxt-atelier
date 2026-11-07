import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/auth', import.meta.url))
const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-csrf-')), 'db.sqlite')}`

const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  fetch(`/api/_atelier${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('CSRF protection and sign-in rate limits', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let session: string
  let csrf: string

  beforeAll(async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: database, NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456' } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'ada@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await post('/auth/login', {}, { email: 'ada@example.com', password: 'password 123' })
    const cookies = signedIn.headers.getSetCookie()
    session = cookies.find(c => c.startsWith('atelier-session='))!.split(';')[0]!
    csrf = cookies.find(c => c.startsWith('atelier-csrf='))!.split(';')[0]!.split('=')[1]!
    expect(cookies.find(c => c.startsWith('atelier-csrf='))).toMatch(/SameSite=Strict/i)
  })

  const createRole = (headers: Record<string, string>) => fetch('/api/_atelier/roles/writer', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'cookie': session, ...headers },
    body: JSON.stringify({ label: 'Writer' }),
  })

  it('refuses a cross-site POST that carries the victim\'s session cookie', async () => {
    // what a form on another site submits: the browser adds the cookie, but can't read the token
    const forged = await createRole({ 'origin': 'https://evil.example', 'sec-fetch-site': 'cross-site' })
    expect(forged.status).toBe(403)
    expect((await createRole({ 'origin': 'https://evil.example', 'x-atelier-csrf': csrf })).status).toBe(403)
    expect((await createRole({ 'sec-fetch-site': 'same-site', 'x-atelier-csrf': csrf })).status).toBe(403)
    expect((await createRole({ 'origin': 'null', 'x-atelier-csrf': csrf })).status).toBe(403)
    // same origin, but without the token (or with one planted in a cookie): refused too
    expect((await createRole({ 'sec-fetch-site': 'same-origin' })).status).toBe(403)
    expect((await createRole({ 'x-atelier-csrf': 'planted' })).status).toBe(403)
  })

  it('accepts a same-origin request with the session\'s token', async () => {
    const origin = new URL(url('/')).origin
    expect((await createRole({ 'origin': origin, 'sec-fetch-site': 'same-origin', 'x-atelier-csrf': csrf })).status).toBe(200)
  })

  it('answers 429 after too many failed sign-ins, even with the right password, until the window ends', async () => {
    for (let i = 0; i < 10; i++)
      expect((await post('/auth/login', {}, { email: 'Ada@example.com', password: `wrong ${i}` })).status).toBe(401)
    const limited = await post('/auth/login', {}, { email: 'ada@example.com', password: 'password 123' })
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(800)
    // another account from the same address isn't affected
    expect((await post('/auth/login', {}, { email: 'someone@example.com', password: 'x' })).status).toBe(401)
  })
})
