// The rendered-page cache (`cache.pages`, here 60 s through NUXT_ATELIER_CACHE_PAGES): visitors' pages
// are served again from memory, and a content change clears them; signed-in, draft, preview and editing
// renders are `private, no-store` and never kept, so no one else is ever served them.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

describe('rendered-page cache', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/routing', import.meta.url)) })
  let cookies: string[] = []
  const headers = () => ({ 'content-type': 'application/json', 'cookie': cookies.join('; '), 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! })
  const headline = (text: string) => [{ id: 'h', type: 'Headline', props: { heading: text } }]

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-page-cache-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      NUXT_ATELIER_CACHE_PAGES: '60',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
  })

  it('serves visitors a kept render until content changes, and keeps no one\'s private render', async () => {
    const created = await fetch('/api/_atelier/collections/posts', { method: 'POST', headers: headers(), body: JSON.stringify({ data: { title: 'Cached', slug: 'cached', content: headline('Published words') }, publish: true }) })
    const { id, version } = await created.json() as { id: string, version: number }

    const first = await fetch('/blog/cached')
    expect(first.headers.get('x-atelier-cache')).toBe('miss')
    const firstBody = await first.text()
    expect(firstBody).toContain('Published words')
    const second = await fetch('/blog/cached')
    expect(second.headers.get('x-atelier-cache')).toBe('hit')
    expect(await second.text()).toBe(firstBody)

    // a draft, seen by its editor: private, not kept, not what visitors get
    const saved = await fetch(`/api/_atelier/collections/posts/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ version, data: { content: headline('Draft words') } }) })
    expect(saved.status).toBe(200)
    for (const path of ['/blog/cached?draft=true', '/blog/cached']) {
      const editor = await fetch(path, { headers: { cookie: cookies.join('; ') } })
      expect(editor.headers.get('cache-control')).toBe('private, no-store')
      expect(editor.headers.get('x-atelier-cache')).toBeNull()
      await editor.text()
    }
    for (const path of ['/blog/cached?_atelier=edit', '/blog/cached?preview=anything']) {
      const response = await fetch(path)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('x-atelier-cache')).toBeNull()
      await response.text()
    }
    // the save cleared the cache: visitors get a fresh render, of the published version
    const after = await fetch('/blog/cached')
    expect(after.headers.get('x-atelier-cache')).toBe('miss')
    const body = await after.text()
    expect(body).toContain('Published words')
    expect(body).not.toContain('Draft words')

    // publishing shows at once
    const current = await (await fetch(`/api/_atelier/collections/posts/${id}?draft=true`, { headers: headers() })).json() as { version: number }
    expect((await fetch(`/api/_atelier/collections/posts/${id}/publish`, { method: 'POST', headers: headers(), body: JSON.stringify({ version: current.version }) })).status).toBe(200)
    expect(await (await fetch('/blog/cached')).text()).toContain('Draft words')
    expect((await fetch('/blog/cached')).headers.get('x-atelier-cache')).toBe('hit')
  })
})
