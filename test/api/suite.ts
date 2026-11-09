// The content API suite, run against a fixture under Nuxt 4 and under `compatibilityVersion: 5`
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

interface Session { cookie: string, csrf: string }

export function contentApiSuite(label: string, rootDir: string) {
  describe(`content API (${label})`, async () => {
    await setup({ setupTimeout: 300_000, rootDir })
    const sessions: Record<string, Session> = {}
    const ids: Record<string, string> = {}

    async function api(as: string | null, method: string, path: string, body?: unknown) {
      const session = as ? sessions[as]! : undefined
      const response = await fetch(`/api/_atelier${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...session ? { 'cookie': session.cookie, 'x-atelier-csrf': session.csrf } : {} },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: response.status, body: await response.json().catch(() => undefined) }
    }
    const q = (params: Record<string, unknown>) => `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))}`

    beforeAll(async () => {
      await startServer({ env: {
        NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-api-')), 'db.sqlite')}`,
        NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
        NUXT_ATELIER_LIMITS_WRITES_PER_MINUTE: '40',
      } })
      for (const [name, role] of [['admin', 'admin'], ['writer', 'writer'], ['other', 'writer'], ['intern', 'intern']] as const) {
        const user = await (await fetch('/api/test/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, role, password: 'password 123' }) })).json()
        ids[name] = user.id
        const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'password 123' }) })
        const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
        sessions[name] = { cookie: cookies.join('; '), csrf: cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! }
      }
    })

    it('creates, reads, updates with the version read, and deletes entries', async () => {
      const ada = await api('admin', 'POST', '/collections/authors', { data: { name: 'Ada', email: 'ada@example.com' } })
      expect(ada).toMatchObject({ status: 200, body: { version: 1, createdBy: ids.admin, data: { name: 'Ada' } } })
      ids.ada = ada.body.id
      const created = await api('admin', 'POST', '/collections/articles', { data: { title: 'Hello', slug: 'hello', category: 'news', views: 3, author: ids.ada, internalNotes: 'check the facts' } })
      expect(created.status).toBe(200)
      const id = created.body.id
      expect((await api('admin', 'GET', `/collections/articles/${id}${q({ depth: '1' })}`)).body.data.author).toMatchObject({ id: ids.ada, data: { name: 'Ada' } })

      const updated = await api('admin', 'PATCH', `/collections/articles/${id}`, { version: 1, data: { views: 4 } })
      expect(updated.body).toMatchObject({ version: 2, data: { title: 'Hello', views: 4, internalNotes: 'check the facts' } }) // merged
      expect((await api('admin', 'PATCH', `/collections/articles/${id}`, { version: 1, data: { views: 5 } })).status).toBe(409)
      expect((await api('admin', 'GET', `/collections/articles/${id}/revisions`)).body.map((r: { version: number }) => r.version)).toEqual([2, 1])
      expect((await api('admin', 'GET', `/collections/articles/${id}/revisions/1`)).body.data.views).toBe(3)

      const doomed = await api('admin', 'POST', '/collections/articles', { data: { title: 'Doomed' } })
      expect((await api('admin', 'DELETE', `/collections/articles/${doomed.body.id}`)).status).toBe(200)
      expect((await api('admin', 'GET', `/collections/articles/${doomed.body.id}`)).status).toBe(404)
      const log = (await api('admin', 'GET', '/audit?action=entry.deleted')).body
      expect(log[0]).toMatchObject({ actorId: ids.admin, target: { type: 'articles', id: doomed.body.id } })
    })

    it('lists with a filter, sort, field selection and population, capped to the largest page size', async () => {
      for (const [title, category, views] of [['Guide one', 'guides', 50], ['News two', 'news', 90], ['News three', 'news', 10], ['Guide four', 'guides', 70], ['News five', 'news', 30], ['News six', 'news', 60]] as const)
        await api('admin', 'POST', '/collections/articles', { data: { title, category, views, author: ids.ada } })
      const { status, body } = await api('admin', 'GET', `/collections/articles${q({ filter: { category: { eq: 'news' } }, sort: '-views', fields: 'title,views,author', depth: '1', limit: '50' })}`)
      expect(status).toBe(200)
      expect(body.limit).toBe(5) // capped
      expect(body.total).toBe(5)
      expect(body.items.map((e: { data: { title: string } }) => e.data.title)).toEqual(['News two', 'News six', 'News five', 'News three', 'Hello'])
      expect(Object.keys(body.items[0].data).toSorted()).toEqual(['author', 'title', 'views'])
      expect(body.items[0].data.author).toMatchObject({ data: { name: 'Ada' } })

      const first = await api('admin', 'GET', `/collections/articles${q({ sort: 'title', limit: '4' })}`)
      const second = await api('admin', 'GET', `/collections/articles${q({ sort: 'title', limit: '4', cursor: first.body.next })}`)
      expect([...first.body.items, ...second.body.items].map((e: { data: { title: string } }) => e.data.title))
        .toEqual(['Guide four', 'Guide one', 'Hello', 'News five', 'News six', 'News three', 'News two'])
      expect(second.body.next).toBeNull()
    })

    it('omits fields the caller can\'t read, there and in populated entries', async () => {
      const { body } = await api('writer', 'GET', `/collections/articles${q({ filter: { title: { eq: 'Hello' } }, depth: '1' })}`)
      expect(body.items[0].data).not.toHaveProperty('internalNotes')
      expect(body.items[0].data.author.data).toEqual({ name: 'Ada', coauthored: [] }) // email hidden from writers
      expect((await api('admin', 'GET', `/collections/articles${q({ filter: { title: { eq: 'Hello' } } })}`)).body.items[0].data.internalNotes).toBe('check the facts')
    })

    it('enforces each operation: visitors read but don\'t write, 403 without the permission, own entries only', async () => {
      expect((await api(null, 'GET', '/collections/articles')).status).toBe(200) // the public role
      expect((await api(null, 'POST', '/collections/articles', { data: { title: 'Anonymous' } })).status).toBe(401)
      expect((await api('intern', 'GET', '/collections/authors')).status).toBe(403)

      const mine = await api('writer', 'POST', '/collections/articles', { data: { title: 'Mine' } })
      expect(mine.status).toBe(200)
      expect((await api('writer', 'PATCH', `/collections/articles/${mine.body.id}`, { version: 1, data: { title: 'Still mine' } })).status).toBe(200)
      // the writer can't update or delete someone else's article, or set a read-only field
      const theirs = await api('other', 'POST', '/collections/articles', { data: { title: 'Theirs' } })
      expect((await api('writer', 'PATCH', `/collections/articles/${theirs.body.id}`, { version: 1, data: { title: 'Taken' } })).status).toBe(403)
      expect((await api('writer', 'DELETE', `/collections/articles/${theirs.body.id}`)).status).toBe(403)
      const slug = await api('writer', 'PATCH', `/collections/articles/${mine.body.id}`, { version: 2, data: { slug: 'new-slug' } })
      expect(slug).toMatchObject({ status: 403, body: { data: { code: 'forbidden', fields: ['slug'] } } })
      expect((await api('writer', 'POST', '/collections/articles', { data: { title: 'Sneaky', internalNotes: 'x' } })).status).toBe(403)

      // the intern reads only their own articles
      await api('intern', 'POST', '/collections/articles', { data: { title: 'Intern draft' } })
      const seen = await api('intern', 'GET', '/collections/articles')
      expect(seen.body.items.map((e: { data: { title: string } }) => e.data.title)).toEqual(['Intern draft'])
      expect((await api('intern', 'GET', `/collections/articles/${theirs.body.id}`)).status).toBe(403)
    })

    it('reads a singleton\'s defaults before its first save, then saves it', async () => {
      expect((await api('writer', 'GET', '/singletons/settings')).body).toMatchObject({ version: null, data: { siteName: 'My site' } })
      const saved = await api('writer', 'PATCH', '/singletons/settings', { version: null, data: { footer: '© Atelier' } })
      expect(saved.body).toMatchObject({ version: 1, data: { siteName: 'My site', footer: '© Atelier' } })
      expect((await api('writer', 'PATCH', '/singletons/settings', { version: null, data: { footer: 'x' } })).status).toBe(409)
      expect((await api('intern', 'GET', '/singletons/settings')).status).toBe(403)
    })

    it('answers errors in one shape, with a code and field details', async () => {
      const invalid = await api('admin', 'POST', '/collections/articles', { data: { title: '', views: -1 } })
      expect(invalid.status).toBe(422)
      // the whole body: Nuxt's error shape, with the code and details under `data`
      expect(invalid.body).toEqual({
        error: true,
        url: expect.stringMatching(/\/api\/_atelier\/collections\/articles$/),
        statusCode: 422,
        statusMessage: expect.any(String),
        message: 'Invalid entry: title: required; views: expected 0 or more',
        data: { code: 'validation_failed', errors: [{ path: 'title', message: 'required' }, { path: 'views', message: 'expected 0 or more' }] },
      })
      const bodies = await Promise.all([
        api(null, 'DELETE', `/collections/articles/${ids.ada}`),
        api('intern', 'GET', '/collections/authors'),
        api('admin', 'GET', '/collections/nope'),
        api('admin', 'GET', `/collections/articles${q({ filter: { nope: { eq: 1 } } })}`),
        api('admin', 'PUT', '/collections/articles'),
      ])
      expect(bodies.map(b => [b.status, b.body.data.code])).toEqual([[401, 'unauthenticated'], [403, 'forbidden'], [404, 'not_found'], [400, 'invalid_query'], [405, 'method_not_allowed']])
      expect(bodies[3]!.body.message).toBe('Unknown field "nope"')
      expect((await api('admin', 'PATCH', `/collections/articles/${ids.ada}`, { data: {} })).status).toBe(404)
    })

    it('accepts scoped API tokens, and refuses revoked or expired ones', async () => {
      const bearer = (token: string, method: string, path: string, body?: unknown) => fetch(`/api/_atelier${path}`, {
        method,
        headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(r => r.status)

      const reader = await api('admin', 'POST', '/tokens', { name: 'Static site build' })
      expect(reader.body).toMatchObject({ name: 'Static site build', permissions: { '*': { actions: ['read'] } }, token: expect.stringMatching(/^atk_/) })
      expect(await bearer(reader.body.token, 'GET', '/collections/articles')).toBe(200)
      expect(await bearer(reader.body.token, 'POST', '/collections/articles', { data: { title: 'Nope' } })).toBe(403)

      const importer = await api('admin', 'POST', '/tokens', { name: 'Importer', permissions: { articles: { actions: ['create', 'read'], hidden: ['internalNotes'] } } })
      expect(await bearer(importer.body.token, 'POST', '/collections/articles', { data: { title: 'Imported' } })).toBe(200)
      expect(await bearer(importer.body.token, 'GET', '/collections/authors')).toBe(403)
      expect(await bearer(importer.body.token, 'POST', '/collections/articles', { data: { title: 'With notes', internalNotes: 'x' } })).toBe(403)
      expect(await bearer(importer.body.token, 'GET', '/users')).toBe(401) // tokens reach the content API only

      const listed = (await api('admin', 'GET', '/tokens')).body
      expect(JSON.stringify(listed)).not.toContain(reader.body.token)
      expect(listed.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(['Static site build', 'Importer']))

      expect((await api('admin', 'DELETE', `/tokens/${reader.body.id}`)).status).toBe(200)
      expect(await bearer(reader.body.token, 'GET', '/collections/articles')).toBe(401)
      expect((await api('admin', 'DELETE', `/tokens/${reader.body.id}`)).status).toBe(404)
      expect(await bearer('atk_made-up', 'GET', '/collections/articles')).toBe(401)

      const soon = await api('admin', 'POST', '/tokens', { name: 'Short-lived', expiresAt: new Date(Date.now() + 1500).toISOString() })
      expect(await bearer(soon.body.token, 'GET', '/collections/articles')).toBe(200)
      await new Promise(resolve => setTimeout(resolve, 1600))
      expect(await bearer(soon.body.token, 'GET', '/collections/articles')).toBe(401)

      expect((await api('writer', 'POST', '/tokens', { name: 'Mine' })).status).toBe(403)
      const log = (await api('admin', 'GET', '/audit')).body.map((e: { action: string }) => e.action)
      expect(log).toEqual(expect.arrayContaining(['token.created', 'token.revoked']))
    })

    it('renders queried content on the server with useAtelierQuery', async () => {
      const html = await (await fetch('/articles', { headers: { cookie: sessions.admin!.cookie } })).text()
      expect([...html.matchAll(/<li class="article">([^<]*)<\/li>/g)].map(m => m[1]!.trim())).toEqual(['Guide four', 'Guide one'])
    })

    it('describes the API in OpenAPI 3.1, for administrators', async () => {
      const { Validator } = await import('@seriousme/openapi-schema-validator')
      const { status, body } = await api('admin', 'GET', '/openapi.json')
      expect(status).toBe(200)
      expect((await new Validator().validate(body)).valid).toBe(true)
      expect(Object.keys(body.paths)).toEqual(expect.arrayContaining(['/api/_atelier/collections/articles', '/api/_atelier/collections/authors/{id}', '/api/_atelier/singletons/settings']))
      expect((await api('writer', 'GET', '/openapi.json')).status).toBe(403)
    })

    it('limits writes per user per minute', async () => {
      let status = 200
      for (let i = 0; i < 45 && status === 200; i++)
        status = (await api('other', 'POST', '/collections/articles', { data: { title: `Burst ${i}` } })).status
      expect(status).toBe(429)
      expect((await api('admin', 'POST', '/collections/articles', { data: { title: 'Unaffected' } })).status).toBe(200)
    })

    it('syncs two-way relations, refusing a change to the other side the caller can\'t make', async () => {
      const bea = (await api('admin', 'POST', '/collections/authors', { data: { name: 'Bea' } })).body
      const article = (await api('admin', 'POST', '/collections/articles', { data: { title: 'Pair', coauthors: [bea.id] } })).body
      expect((await api('admin', 'GET', `/collections/authors/${bea.id}`)).body.data.coauthored).toEqual([article.id])

      // writers may update their own articles but only read authors: linking one would change the author
      const own = (await api('writer', 'POST', '/collections/articles', { data: { title: 'Mine' } })).body
      const denied = await api('writer', 'PATCH', `/collections/articles/${own.id}`, { version: 1, data: { coauthors: [bea.id] } })
      expect(denied).toMatchObject({ status: 403, body: { data: { code: 'forbidden' } } })
      expect((await api('admin', 'GET', `/collections/authors/${bea.id}`)).body.data.coauthored).toEqual([article.id])
    })
  })
}
