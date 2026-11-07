import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/auth', import.meta.url))
const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-setup-')), 'db.sqlite')}`

/** A JSON request, as the user whose cookies (`atelier-session=…; atelier-csrf=…`) are given. */
async function api(method: string, path: string, body?: unknown, cookie?: string) {
  const csrf = cookie && /atelier-csrf=([^;]+)/.exec(cookie)?.[1]
  const response = await fetch(`/api/_atelier${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...cookie ? { cookie } : {}, ...csrf ? { 'x-atelier-csrf': csrf } : {} },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]!).filter(c => /^atelier-(?:session|csrf)=/.test(c))
  return { status: response.status, body: await response.json().catch(() => undefined), cookie: cookies.length ? cookies.join('; ') : undefined }
}
const signIn = async (email: string) => (await api('POST', '/auth/login', { email, password: 'password 123' })).cookie!

describe('first-run setup, users and roles', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let admin: string
  let adminId: string

  beforeAll(async () => {
    await startServer({ env: { NUXT_ATELIER_DATABASE_URL: database, NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456' } })
  })

  it('creates the first administrator only while there are no users, and signs them in', async () => {
    expect((await api('GET', '/setup')).body).toEqual({ needed: true })
    expect((await api('POST', '/setup', { email: 'root@example.com', password: 'short' })).status).toBe(400)

    const created = await api('POST', '/setup', { email: 'root@example.com', name: 'Root', password: 'password 123' })
    expect(created).toMatchObject({ status: 200, body: { email: 'root@example.com', role: 'admin' } })
    admin = created.cookie!
    adminId = created.body.id
    expect((await api('GET', '/auth/me', undefined, admin)).body.user).toMatchObject({ role: 'admin' })

    expect((await api('GET', '/setup')).body).toEqual({ needed: false })
    expect((await api('POST', '/setup', { email: 'intruder@example.com', password: 'password 123' })).status).toBe(409)
  })

  it('lists the built-in, code and seeded database roles', async () => {
    const { body } = await api('GET', '/roles', undefined, admin)
    expect(body.map((r: { name: string, source: string }) => `${r.name}:${r.source}`)).toEqual(['admin:builtin', 'reviewer:code', 'editor:database'])
    expect((await api('PUT', '/roles/reviewer', { content: {} }, admin)).status).toBe(409) // in code
    expect((await api('PUT', '/roles/admin', {}, admin)).status).toBe(409)
    expect((await api('PUT', '/roles/manager', { label: 'Manager', capabilities: ['users'] }, admin)).status).toBe(200)
    expect((await api('PUT', '/roles/broken', { capabilities: ['everything'] }, admin)).status).toBe(422)
  })

  it('refuses to demote or delete the last administrator', async () => {
    expect((await api('PATCH', `/users/${adminId}`, { role: 'editor' }, admin)).status).toBe(409)
    expect((await api('DELETE', `/users/${adminId}`, undefined, admin)).status).toBe(409)

    const second = await api('POST', '/users', { email: 'ada@example.com', role: 'admin', password: 'password 123' }, admin)
    expect(second.status).toBe(200)
    expect((await api('PATCH', `/users/${adminId}`, { role: 'editor' }, admin)).status).toBe(200)
    // the role applies at once: the demoted user lost user management with their next request
    expect((await api('GET', '/users', undefined, admin)).status).toBe(403)
    admin = await signIn('ada@example.com')
    expect((await api('PATCH', `/users/${second.body.id}`, { role: 'editor' }, admin)).status).toBe(409)
  })

  it('checks who may manage users, and keeps the users capability from reaching the admin role', async () => {
    expect((await api('POST', '/users', { email: 'x@example.com', role: 'nope' }, admin)).status).toBe(422)
    const manager = await api('POST', '/users', { email: 'mia@example.com', role: 'manager', password: 'password 123' }, admin)
    await api('POST', '/users', { email: 'ed@example.com', role: 'editor', password: 'password 123' }, admin)
    const mia = await signIn('mia@example.com')
    const ed = await signIn('ed@example.com')
    const { body: users } = await api('GET', '/users', undefined, mia)
    const ada = users.find((u: { email: string }) => u.email === 'ada@example.com')

    expect((await api('POST', '/users', { email: 'new@example.com', role: 'editor' }, mia)).status).toBe(200)
    expect((await api('POST', '/users', { email: 'boss@example.com', role: 'admin' }, mia)).status).toBe(403)
    expect((await api('PATCH', `/users/${ada.id}`, { name: 'Changed' }, mia)).status).toBe(403)
    expect((await api('DELETE', `/users/${ada.id}`, undefined, mia)).status).toBe(403)
    expect((await api('PATCH', `/users/${manager.body.id}`, { role: 'reviewer' }, mia)).status).toBe(403)

    expect((await api('GET', '/users', undefined, ed)).status).toBe(403)
    expect((await api('GET', '/users')).status).toBe(401)
    expect((await api('DELETE', '/roles/editor', undefined, admin)).status).toBe(409) // in use
  })

  it('records who did what, to what and when, readable by administrators only', async () => {
    await api('POST', '/auth/login', { email: 'ada@example.com', password: 'wrong password' })
    const { status, body: log } = await api('GET', '/audit?limit=200', undefined, admin)
    expect(status).toBe(200)
    const find = (action: string, match: object = {}) => log.find((e: object & { action: string }) => e.action === action && expect.objectContaining(match).asymmetricMatch(e))

    expect(find('setup.completed', { actorId: adminId })).toBeDefined()
    // the role change: who, when, old and new role
    const demotion = find('user.updated', { actorId: adminId, target: { type: 'user', id: adminId } })
    expect(demotion).toMatchObject({ details: { role: { from: 'admin', to: 'editor' } }, ip: expect.any(String) })
    expect(Date.parse(demotion.at)).toBeGreaterThan(Date.now() - 600_000)
    expect(find('user.created', { details: { email: 'mia@example.com', role: 'manager' } })).toBeDefined()
    expect(find('role.saved', { target: { type: 'role', id: 'manager' }, details: { from: null, to: { label: 'Manager', capabilities: ['users'] } } })).toBeDefined()
    expect(find('auth.sign-in', { details: { method: 'password' } })).toBeDefined()
    expect(find('auth.sign-in-failed', { actorId: null, details: { method: 'password', email: 'ada@example.com' } })).toBeDefined()
    expect(JSON.stringify(log)).not.toContain('password 123')

    expect(log.map((e: { at: string }) => e.at)).toEqual(log.map((e: { at: string }) => e.at).toSorted().reverse()) // newest first
    const older = await api('GET', `/audit?limit=2&before=${encodeURIComponent(log[1].at)}`, undefined, admin)
    expect(older.body[0].at < log[1].at).toBe(true)

    expect((await api('GET', '/audit', undefined, await signIn('mia@example.com'))).status).toBe(403)
  })
})
