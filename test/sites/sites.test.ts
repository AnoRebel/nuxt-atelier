// Several sites from one deployment (test/fixtures/sites): the host picks the site, and nothing of one site
// is readable or writable from another, endpoint by endpoint; shared types are everyone's.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/sites', import.meta.url))
interface Session { cookie: string, csrf: string }

describe('sites', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  const sessions: Record<string, Session> = {}
  const ids: Record<string, string> = {}

  /** A request to `host`'s site, as `as` (or a visitor). */
  async function on(host: string, as: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const session = as ? sessions[as] : undefined
    // `site:/old` is a site path; anything else is under the CMS API, unless it's already a full path
    const url = path.startsWith('site:') ? path.slice(5) : path.startsWith('/api') || path.startsWith('/_atelier') || path.endsWith('.xml') || path.endsWith('.txt') ? path : `/api/_atelier${path}`
    const response = await fetch(url, {
      method,
      headers: { 'x-forwarded-host': host, ...body === undefined || body instanceof Uint8Array ? {} : { 'content-type': 'application/json' }, ...session ? { 'cookie': session.cookie, 'x-atelier-csrf': session.csrf } : {}, ...headers },
      body: (body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body)) as BodyInit | undefined,
      redirect: 'manual',
    })
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    }
    catch {
      // not JSON: a page, a sitemap
    }
    return { status: response.status, body: json as any, text } // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers
  }
  const A = 'a.test'
  const B = 'b.test'

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-sites-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      NUXT_ATELIER_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'atelier-sites-files-')),
      NUXT_ATELIER_FORMS_MIN_FILL_TIME: '0',
    } })
    for (const [name, role] of [['admin', 'admin'], ['editor', 'editor']] as const) {
      const user = await (await fetch('/api/test/users', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-host': A }, body: JSON.stringify({ email: `${name}@example.com`, role, password: 'password 123' }) })).json()
      ids[name] = user.id
      const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-host': A }, body: JSON.stringify({ email: `${name}@example.com`, password: 'password 123' }) })
      const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
      sessions[name] = { cookie: cookies.join('; '), csrf: cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! }
    }
    // the editor works on site A only
    expect((await on(A, 'admin', 'PUT', `/users/${ids.editor}/sites`, { sites: { a: 'editor' } })).body).toEqual({ a: 'editor' })
  })

  it('picks the site by host, and answers 404 for a host no site has', async () => {
    expect((await on(A, 'admin', 'GET', '/schema')).body).toMatchObject({ site: 'a', sites: [{ name: 'a', label: 'Site A' }, { name: 'b', label: 'Site B' }] })
    expect((await on('WWW.B.TEST', 'admin', 'GET', '/schema')).body).toMatchObject({ site: 'b', locales: { codes: ['de'], default: 'de' } }) // its own locales
    expect((await on('elsewhere.test', null, 'GET', '/collections/posts')).status).toBe(404)
    expect((await on('elsewhere.test', null, 'GET', '/api/_atelier/health/live')).status).toBe(200)
  })

  it('keeps each site\'s entries, singletons and URLs to itself, and shares shared types', async () => {
    const tag = (await on(A, 'admin', 'POST', '/collections/tags', { data: { name: 'news' } })).body
    const a = (await on(A, 'admin', 'POST', '/collections/posts', { data: { title: 'Hello A', slug: 'hello', tags: [tag.id] }, publish: true })).body
    const b = (await on(B, 'admin', 'POST', '/collections/posts', { data: { title: 'Hello B', slug: 'hello' }, publish: true })) // the same slug: unique per site
    expect(b.status).toBe(200)
    ids.postA = a.id
    ids.postB = b.body.id

    expect((await on(A, null, 'GET', '/collections/posts')).body.items.map((p: { data: { title: string } }) => p.data.title)).toEqual(['Hello A'])
    expect((await on(B, null, 'GET', `/collections/posts/${ids.postA}`)).status).toBe(404)
    expect((await on(B, 'admin', 'PATCH', `/collections/posts/${ids.postA}`, { version: 1, data: { title: 'Taken' } })).status).toBe(404)
    expect((await on(B, 'admin', 'DELETE', `/collections/posts/${ids.postA}`)).status).toBe(404)
    expect((await on(B, 'admin', 'GET', `/collections/posts/${ids.postA}/revisions`)).status).toBe(404)
    expect((await on(B, 'admin', 'POST', `/collections/posts/${ids.postA}/publish`, { version: 1 })).status).toBe(404)
    expect((await on(A, null, 'GET', `/collections/posts/${ids.postA}`)).body.data.title).toBe('Hello A') // untouched

    expect((await on(A, null, 'GET', '/routes?path=/posts/hello')).body).toMatchObject({ entry: { id: ids.postA } })
    expect((await on(B, null, 'GET', '/routes?path=/posts/hello')).body).toMatchObject({ entry: { id: ids.postB } })
    expect((await on(B, null, 'GET', '/collections/tags')).body.items.map((t: { data: { name: string } }) => t.data.name)).toEqual(['news'])

    await on(A, 'admin', 'PATCH', '/singletons/settings', { version: null, data: { tagline: 'Ours' }, publish: true })
    await on(B, 'admin', 'PATCH', '/singletons/settings', { version: null, data: { tagline: 'Theirs' }, publish: true })
    expect((await on(A, null, 'GET', '/singletons/settings')).body.data.tagline).toBe('Ours')
    expect((await on(B, null, 'GET', '/singletons/settings')).body.data.tagline).toBe('Theirs')
    expect((await on(A, 'admin', 'GET', '/singletons/settings/revisions')).body).toHaveLength(1)
  })

  it('serves each site its own sitemap, robots rules, redirects and search', async () => {
    const sitemapA = (await on(A, null, 'GET', '/sitemap.xml')).text
    expect(sitemapA).toContain('<loc>http://a.test/posts/hello</loc>')
    expect(sitemapA).not.toContain('b.test')
    expect((await on(B, null, 'GET', '/sitemap.xml')).text).toContain('<loc>http://b.test/posts/hello</loc>')

    await on(A, 'admin', 'PUT', '/settings/robots', { value: { indexable: false, rules: [] } })
    expect((await on(A, null, 'GET', '/robots.txt')).text).toMatch(/Disallow: \/$/m)
    expect((await on(B, null, 'GET', '/robots.txt')).text).not.toMatch(/Disallow: \/$/m)

    await on(A, 'admin', 'POST', '/redirects', { source: '/old', target: '/posts/hello' })
    expect((await on(A, null, 'GET', 'site:/old')).status).toBe(301)
    expect((await on(B, null, 'GET', 'site:/old')).status).not.toBe(301)
    expect((await on(B, 'admin', 'GET', '/redirects')).body).toEqual([])

    await on(A, 'admin', 'POST', '/search/rebuild')
    expect((await on(A, null, 'GET', '/search?q=hello')).body.items.map((i: { title: string }) => i.title)).toEqual(['Hello A'])
    expect((await on(B, null, 'GET', '/search?q=hello')).body.items.map((i: { title: string }) => i.title)).toEqual(['Hello B'])
  })

  it('keeps media, forms, comments and API tokens to their site', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    const image = (await on(A, 'admin', 'POST', '/media?filename=a.png', png, { 'content-type': 'image/png' })).body
    expect((await on(A, null, 'GET', `/_atelier/media/${image.id}/a.png`)).status).toBe(200)
    expect((await on(B, null, 'GET', `/_atelier/media/${image.id}/a.png`)).status).toBe(404)
    expect((await on(B, 'admin', 'GET', `/media/${image.id}`)).status).toBe(404)
    expect((await on(B, 'admin', 'GET', '/media')).body.items).toEqual([])

    const form = (await on(A, 'admin', 'POST', '/collections/atelier-forms', { publish: true, data: { title: 'Contact', fields: [{ name: 'email', type: 'email', label: 'Email', required: true }] } })).body
    expect((await on(B, null, 'GET', `/forms/${form.id}`)).status).toBe(404)
    const { token } = (await on(A, null, 'GET', `/forms/${form.id}`)).body
    expect((await on(A, null, 'POST', `/forms/${form.id}/submit`, { _token: token, email: 'jane@example.com' })).status).toBe(200)
    expect((await on(B, null, 'POST', `/forms/${form.id}/submit`, { _token: token, email: 'jane@example.com' })).status).toBe(404)
    expect((await on(B, 'admin', 'GET', `/forms/${form.id}/submissions`)).status).toBe(404)
    expect((await on(B, 'admin', 'POST', '/forms/erase', { email: 'jane@example.com' })).body).toEqual({ deleted: 0 })
    expect((await on(A, 'admin', 'GET', `/forms/${form.id}/submissions`)).body.total).toBe(1)

    expect((await on(B, 'admin', 'POST', `/comments/posts/${ids.postA}`, { body: 'Peeking' })).status).toBe(404)
    expect((await on(B, 'admin', 'GET', `/collab/posts/${ids.postA}`)).status).toBe(404)

    const created = (await on(A, 'admin', 'POST', '/tokens', { name: 'build', permissions: { '*': { actions: ['read'] } } })).body
    const bearer = { authorization: `Bearer ${created.token}` }
    expect((await on(A, null, 'GET', '/collections/posts?draft=true', undefined, bearer)).status).toBe(200)
    expect((await on(B, null, 'GET', '/collections/posts', undefined, bearer)).status).toBe(401)
    expect((await on(B, 'admin', 'GET', '/tokens')).body).toEqual([])
  })

  it('keeps live updates to the site the connection was opened for', async () => {
    const { ticket } = (await on(B, 'admin', 'POST', '/collab/ticket', {})).body
    const origin = new URL(url('/')).origin
    const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/_atelier/ws?ticket=${encodeURIComponent(ticket)}`, { headers: { origin } } as never)
    const received: { topic: string, kind: string }[] = []
    socket.addEventListener('message', event => received.push(JSON.parse(String(event.data))))
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })
    // site A's entry isn't followed on a site B connection; site B's is
    socket.send(JSON.stringify({ subscribe: `entry:posts:${ids.postA}` }))
    socket.send(JSON.stringify({ subscribe: `entry:posts:${ids.postB}` }))
    await new Promise(resolve => setTimeout(resolve, 300))
    await on(A, 'admin', 'POST', `/collab/posts/${ids.postA}`, { edit: true })
    await on(B, 'admin', 'POST', `/collab/posts/${ids.postB}`, { edit: true })
    await expect.poll(() => received.length, { timeout: 2_000 }).toBeGreaterThan(0)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(received.map(r => r.topic)).toEqual([`entry:posts:${ids.postB}`, `entry:posts:${ids.postB}`]) // presence, then the lock
    socket.close()
  })

  it('lets an editor reach only the sites they have a role on', async () => {
    expect((await on(A, 'editor', 'GET', '/schema')).body).toMatchObject({ site: 'a', sites: [{ name: 'a' }], user: { role: 'editor' } })
    expect((await on(A, 'editor', 'POST', '/collections/posts', { data: { title: 'By the editor', slug: 'editor' } })).status).toBe(200)
    // on site B they're a visitor: published content only, no writes, no admin
    expect((await on(B, 'editor', 'POST', '/collections/posts', { data: { title: 'Nope', slug: 'nope' } })).status).toBe(403)
    expect((await on(B, 'editor', 'GET', '/schema')).status).toBe(403)
    expect((await on(B, 'editor', 'GET', '/media')).status).toBe(403)
    expect((await on(B, 'editor', 'GET', '/collections/posts?draft=true')).body.items.map((p: { data: { title: string } }) => p.data.title)).toEqual(['Hello B'])
    // nor can they pick it with the header
    expect((await on(A, 'editor', 'POST', '/collections/posts', { data: { title: 'Sneaky', slug: 'sneaky' } }, { 'x-atelier-site': 'b' })).status).toBe(403)
    expect((await on(A, 'admin', 'GET', '/collections/posts', undefined, { 'x-atelier-site': 'b' })).body.items.map((p: { data: { title: string } }) => p.data.title)).toEqual(['Hello B'])
  })
  it('lets a user manager on one site manage that site\'s users alone', async () => {
    const make = async (email: string) => (await (await fetch('/api/test/users', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-host': A }, body: JSON.stringify({ email, role: 'editor', password: 'password 123' }) })).json()).id as string
    const manager = await make('manager@example.com')
    const onB = await make('on-b@example.com')
    expect((await on(A, 'admin', 'PUT', `/users/${manager}/sites`, { sites: { a: 'manager' } })).status).toBe(200)
    expect((await on(A, 'admin', 'PUT', `/users/${onB}/sites`, { sites: { b: 'editor' } })).status).toBe(200)
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-host': A }, body: JSON.stringify({ email: 'manager@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    sessions.manager = { cookie: cookies.join('; '), csrf: cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! }

    // they see site A's users, not B's or the administrators
    const listed = (await on(A, 'manager', 'GET', '/users')).body.map((u: { email: string }) => u.email)
    expect(listed).toEqual(expect.arrayContaining(['manager@example.com', 'editor@example.com']))
    expect(listed).not.toContain('on-b@example.com')
    expect(listed).not.toContain('admin@example.com')
    // they can't give themselves site B, nor take over B's users
    expect((await on(A, 'manager', 'PUT', `/users/${manager}/sites`, { sites: { a: 'manager', b: 'manager' } })).status).toBe(403)
    expect((await on(A, 'manager', 'PATCH', `/users/${onB}`, { password: 'taken over 123' })).status).toBe(404)
    expect((await on(A, 'manager', 'PUT', `/users/${onB}/sites`, { sites: { a: 'editor' } })).status).toBe(404)
    expect((await on(A, 'manager', 'DELETE', `/users/${onB}`)).status).toBe(404)
    // nor give site B to one of their own
    expect((await on(A, 'manager', 'PUT', `/users/${ids.editor}/sites`, { sites: { a: 'editor', b: 'editor' } })).status).toBe(403)
    // roles are every site's: theirs to read, not to change
    expect((await on(A, 'manager', 'GET', '/roles')).status).toBe(200)
    expect((await on(A, 'manager', 'PUT', '/roles/writer', { capabilities: ['users'] })).status).toBe(403)
    // site A's own users stay theirs to manage
    expect((await on(A, 'manager', 'PATCH', `/users/${ids.editor}`, { name: 'Ed' })).status).toBe(200)
    expect((await on(A, 'manager', 'PUT', `/users/${ids.editor}/sites`, { sites: { a: 'editor' } })).body).toEqual({ a: 'editor' })
  })
  it('shows each user the sites they may reach in the admin, and switches between them', async () => {
    const admin = await createPage()
    await admin.setExtraHTTPHeaders({ 'x-forwarded-host': A })
    await admin.goto(url('/admin'))
    await admin.getByLabel('Email').fill('admin@example.com')
    await admin.getByLabel('Password').fill('password 123')
    await admin.getByRole('button', { name: 'Sign in' }).click()
    await admin.getByRole('heading', { name: 'Dashboard' }).waitFor()
    await admin.goto(url('/admin/collections/posts'))
    await admin.getByRole('link', { name: 'Hello A' }).waitFor()
    await admin.getByLabel('Site').selectOption({ label: 'Site B' })
    await admin.goto(url('/admin/collections/posts'))
    await admin.getByRole('link', { name: 'Hello B' }).waitFor()
    expect(await admin.getByRole('link', { name: 'Hello A' }).count()).toBe(0)

    const editor = await createPage()
    await editor.setExtraHTTPHeaders({ 'x-forwarded-host': A })
    await editor.goto(url('/admin'))
    await editor.getByLabel('Email').fill('editor@example.com')
    await editor.getByLabel('Password').fill('password 123')
    await editor.getByRole('button', { name: 'Sign in' }).click()
    await editor.getByRole('heading', { name: 'Dashboard' }).waitFor()
    expect(await editor.getByLabel('Site').count()).toBe(0) // one site: nothing to switch
    await editor.goto(url('/admin/collections/posts'))
    await editor.getByRole('link', { name: 'Hello A' }).waitFor()
    expect(await editor.getByRole('link', { name: 'Hello B' }).count()).toBe(0)
  })
})
