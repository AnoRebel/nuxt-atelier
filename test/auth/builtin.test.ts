import { spawn } from 'node:child_process'
import { pbkdf2Sync } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer, useTestContext } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../packages/core/src/runtime/server/db/driver'
import { allDrivers } from '../../packages/core/src/runtime/server/db/loaders'
import { query } from '../storage/env'

const rootDir = fileURLToPath(new URL('../fixtures/auth', import.meta.url))
const url = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-auth-')), 'db.sqlite')}`

const login = (email: string, password: string) =>
  fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
const csrfTokens = new Map<string, string>()
/** The session cookie a response sets; its CSRF token is remembered for requests made with it. */
function cookieOf(response: Response) {
  const cookies = response.headers.getSetCookie()
  const session = cookies.find(c => c.startsWith('atelier-session='))!
  const csrf = cookies.find(c => c.startsWith('atelier-csrf='))
  if (csrf)
    csrfTokens.set(session, csrf.split(';')[0]!.split('=')[1]!)
  return session
}
const me = async (cookie?: string) => (await (await fetch('/api/_atelier/auth/me', { headers: cookie ? { cookie: cookie.split(';')[0]! } : {} })).json()).user
const logout = (cookie: string) => fetch('/api/_atelier/auth/logout', { method: 'POST', headers: { 'cookie': cookie.split(';')[0]!, 'x-atelier-csrf': csrfTokens.get(cookie)! } })

describe('built-in auth', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let ada: { id: string }

  beforeAll(async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: url, NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456' } })
    ada = await $fetch('/api/test/users', { method: 'POST', body: { email: 'Ada@Example.com', name: 'Ada', role: 'editor', password: 'first password' } })
  })

  it('signs in with a sealed, HTTP-only, Secure, SameSite=Lax cookie', async () => {
    const response = await login('ada@example.com', 'first password')
    expect(response.status).toBe(200)
    const cookie = cookieOf(response)
    expect(cookie).toMatch(/; HttpOnly/i)
    expect(cookie).toMatch(/; Secure/i)
    expect(cookie).toMatch(/; SameSite=Lax/i)
    expect(cookie).not.toContain('ada@example.com') // sealed: the user isn't readable from it ('@' never occurs in a seal)
    expect(cookie).not.toContain(ada.id)
    expect(await me(cookie)).toEqual({ id: ada.id, email: 'ada@example.com', name: 'Ada', role: 'editor' })
  })

  it('refuses wrong credentials alike, and sets no cookie for anonymous requests', async () => {
    expect((await login('ada@example.com', 'wrong')).status).toBe(401)
    expect((await login('nobody@example.com', 'first password')).status).toBe(401)
    const anonymous = await fetch('/api/_atelier/auth/me')
    expect((await anonymous.json()).user).toBeNull()
    expect(anonymous.headers.getSetCookie()).toEqual([])
  })

  it('rejects a session after sign-out, even if the cookie is replayed', async () => {
    const cookie = cookieOf(await login('ada@example.com', 'first password'))
    expect(cookieOf(await logout(cookie))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i)
    expect(await me(cookie)).toBeNull()
  })

  it('revokes every session on a password reset', async () => {
    const [phone, laptop] = [cookieOf(await login('ada@example.com', 'first password')), cookieOf(await login('ada@example.com', 'first password'))]
    await $fetch('/api/test/password', { method: 'POST', body: { id: ada.id, password: 'second password' } })
    expect(await me(phone)).toBeNull()
    expect(await me(laptop)).toBeNull()
    expect((await login('ada@example.com', 'first password')).status).toBe(401)
    expect((await login('ada@example.com', 'second password')).status).toBe(200)
  })

  it('upgrades a hash with older settings on sign-in', async () => {
    const salt = Buffer.alloc(16, 3)
    const legacy = `$pbkdf2-sha256$i=600000$${salt.toString('base64').replace(/=+$/, '')}$${pbkdf2Sync('legacy pw', salt, 600_000, 32, 'sha256').toString('base64').replace(/=+$/, '')}`
    const driver = await connect(url, { loaders: allDrivers })
    const hashOf = async () => (await query(driver, sql`select password_hash from atelier_users where email = 'grace@example.com'`))[0]!.password_hash
    try {
      await query(driver, sql`insert into atelier_users (_id, email, role, password_hash, _created_at, _updated_at) values ('u-grace', 'grace@example.com', 'editor', ${legacy}, 'now', 'now')`)
      expect((await login('grace@example.com', 'legacy pw')).status).toBe(200)
      expect(await hashOf()).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$/)
      expect((await login('grace@example.com', 'legacy pw')).status).toBe(200)
    }
    finally {
      await driver.close()
    }
  })

  it('has no passkey routes or code when passkeys are off', async () => {
    expect((await fetch('/api/_atelier/auth/passkeys/login-options', { method: 'POST' })).status).toBe(404)
    const output = useTestContext().nuxt!.options.nitro.output!.dir!
    const files = readdirSync(output, { recursive: true, withFileTypes: true }).filter(f => f.isFile() && /\.m?js$/.test(f.name))
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter(f => readFileSync(join(f.parentPath, f.name), 'utf8').includes('simplewebauthn'))).toEqual([])
  })
  it('logs a failed sign-in as a JSON line with its correlation id, and never the password', async () => {
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, () => {
        const { port } = probe.address() as { port: number }
        probe.close(() => resolve(port))
      })
    })
    // the built app, run as in production, its output read
    const server = spawn(process.execPath, [join(useTestContext().nuxt!.options.nitro.output!.dir!, 'server/index.mjs')], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), NUXT_ATELIER_LOG_FORMAT: 'json', NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456', NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-log-')), 'db.sqlite')}` },
    })
    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk
    }
    server.stdout.on('data', read)
    server.stderr.on('data', read)
    try {
      await expect.poll(() => globalThis.fetch(`http://127.0.0.1:${port}/api/_atelier/health/live`).then(r => r.status, () => 0), { timeout: 30_000 }).toBe(200)
      const response = await globalThis.fetch(`http://127.0.0.1:${port}/api/_atelier/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'req-login-1' }, body: JSON.stringify({ email: 'nobody@example.com', password: 'hunter2-secret-guess' }) })
      expect(response.status).toBe(401)
      await expect.poll(() => output.includes('Sign-in failed')).toBe(true)
      const line = output.split('\n').find(l => l.includes('Sign-in failed'))!
      expect(JSON.parse(line)).toMatchObject({ level: 'warn', message: 'Sign-in failed', event: 'auth.sign-in-failed', requestId: 'req-login-1' })
      expect(output).not.toContain('hunter2-secret-guess')
    }
    finally {
      server.kill()
    }
  })
})
