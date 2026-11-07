import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setup, startServer, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/better-auth', import.meta.url))
const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-better-auth-')), 'db.sqlite')}`

// A mock OAuth 2 provider: authorizes whoever `signingIn` names, by using their email as the code and token
let signingIn = { email: '', name: '' }
const people = new Map<string, { id: string, email: string, name: string, email_verified: boolean }>()
const provider = createServer((req, res) => {
  const requestUrl = new URL(req.url!, 'http://mock')
  if (requestUrl.pathname === '/authorize') {
    const code = signingIn.email
    people.set(code, { id: `mock-${code}`, email: code, name: signingIn.name, email_verified: true }) // plain OAuth 2: the profile's id
    const back = new URL(requestUrl.searchParams.get('redirect_uri')!)
    back.searchParams.set('code', code)
    back.searchParams.set('state', requestUrl.searchParams.get('state')!)
    res.writeHead(302, { location: back.href }).end()
  }
  else if (requestUrl.pathname === '/token') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const code = new URLSearchParams(body).get('code')!
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: code, token_type: 'Bearer', expires_in: 3600 }))
    })
  }
  else if (requestUrl.pathname === '/userinfo') {
    const person = people.get(req.headers.authorization!.replace('Bearer ', ''))
    res.writeHead(person ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(person ?? {}))
  }
  else {
    res.writeHead(404).end()
  }
})
await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`

/** A browser stand-in: keeps cookies, follows no redirects by itself. */
function browser() {
  const jar = new Map<string, string>()
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async request(path: string, init: RequestInit = {}) {
      const target = path.startsWith('http') ? path : url(path)
      const own = target.startsWith(url('/'))
      const response = await globalThis.fetch(target, {
        redirect: 'manual',
        ...init,
        headers: { ...own ? { cookie: cookie(), origin: new URL(url('/')).origin } : {}, ...init.headers as Record<string, string> },
      })
      if (own) {
        for (const set of response.headers.getSetCookie()) {
          const [pair] = set.split(';')
          const [name, ...value] = pair!.split('=')
          if (/max-age=0|expires=thu, 01 jan 1970/i.test(set))
            jar.delete(name!)
          else
            jar.set(name!, value.join('='))
        }
      }
      return response
    },
    async signInWith(email: string, name: string) {
      signingIn = { email, name }
      const start = await this.request('/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'mock', callbackURL: '/' }) })
      expect(start.status).toBe(200)
      const authorize = await this.request((await start.json()).url) // the provider
      const callback = await this.request(authorize.headers.get('location')!) // back to Better Auth
      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).not.toContain('/error')
      return callback
    },
    me: async function (this: { request: (p: string) => Promise<Response> }) {
      return (await (await this.request('/api/_atelier/auth/me')).json()).user
    },
    csrf: () => jar.get('atelier-csrf'),
  }
}

describe('Better Auth adapter', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let admin: ReturnType<typeof browser>

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: database,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      MOCK_OAUTH_URL: providerUrl,
    } })
  })
  afterAll(() => new Promise(resolve => provider.close(resolve)))

  it('runs first-run setup and password sign-in through Better Auth', async () => {
    admin = browser()
    const setupResponse = await admin.request('/api/_atelier/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@cms.example', name: 'Root', password: 'password 123' }) })
    expect(setupResponse.status).toBe(200)
    expect(await admin.me()).toMatchObject({ email: 'root@cms.example', role: 'admin' })

    const other = browser()
    expect((await other.request('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@cms.example', password: 'wrong' }) })).status).toBe(401)
    expect((await other.request('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@cms.example', password: 'password 123' }) })).status).toBe(200)
    expect(await other.me()).toMatchObject({ role: 'admin' })
  })

  it('maps a user signing in through OAuth to a CMS role, and permissions apply to it', async () => {
    const ana = browser()
    await ana.signInWith('ana@cms.example', 'Ana')
    expect(await ana.me()).toMatchObject({ email: 'ana@cms.example', name: 'Ana', role: 'editor' })
    expect((await ana.request('/api/_atelier/users')).status).toBe(403) // editors don't manage users

    const users = await (await admin.request('/api/_atelier/users')).json()
    expect(users).toContainEqual(expect.objectContaining({ email: 'ana@cms.example', role: 'editor' }))
  })

  it('gives no CMS access to someone the role mapping doesn\'t cover, until an administrator gives a role', async () => {
    const guest = browser()
    await guest.signInWith('guest@elsewhere.example', 'Guest')
    expect(await guest.me()).toBeNull()

    const users = await (await admin.request('/api/_atelier/users')).json() as { id: string, email: string, role: string }[]
    const record = users.find(u => u.email === 'guest@elsewhere.example')!
    expect(record.role).toBe('')
    const grant = await admin.request(`/api/_atelier/users/${record.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-atelier-csrf': admin.csrf() ?? '' }, body: JSON.stringify({ role: 'editor' }) })
    expect(grant.status).toBe(200)
    expect(await guest.me()).toMatchObject({ role: 'editor' })
  })
})
