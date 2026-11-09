import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { PREVIEW_PURPOSE, signToken } from '../../packages/core/src/runtime/server/secrets'
import { connectEngine, query } from '../storage/env'

const rootDir = fileURLToPath(new URL('../fixtures/routing', import.meta.url))
const SECRET = 'a-test-secret-that-is-long-enough-123456'
const DATABASE = join(mkdtempSync(join(tmpdir(), 'atelier-routing-')), 'db.sqlite')
/** What Nuxt's deriveSecret gives the server for `purpose` with this app secret (HKDF-SHA256, salt "nuxt"). */
async function derived(purpose: string, secret = SECRET) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('nuxt'), info: new TextEncoder().encode(purpose) }, key, 256)
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('site routing', async () => {
  await setup({ setupTimeout: 300_000, rootDir })
  let cookie = ''
  let csrf = ''

  const api = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', cookie, 'x-atelier-csrf': csrf },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
    })
    return { status: response.status, body: await response.json() }
  }
  const page = async (path: string, signedIn = true) => {
    const response = await fetch(path, { headers: signedIn ? { cookie } : {} })
    return { status: response.status, html: (await response.text()).replace(/<!--[[\]]-->/g, '') }
  }

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${DATABASE}`,
      NUXT_APP_SECRET: SECRET,
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    cookie = cookies.join('; ')
    csrf = cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]!
  })

  it('serves an entry at its URL with the catch-all page, rendering its blocks in the default layout', async () => {
    const created = await api('/api/_atelier/collections/pages', 'POST', { data: {
      title: 'About',
      slug: 'about',
      content: [{ id: 'b1', type: 'Hero', props: { title: 'About us' } }],
    } })
    expect(created.status).toBe(200)
    expect(created.body.path).toBe('/about') // entries carry their URL (Pruvious #12)

    const about = await page('/about')
    expect(about.status).toBe(200)
    expect(about.html).toMatch(/<div class="layout-default"><h1 class="hero">\s*About us\s*<\/h1><\/div>/)
    expect((await page('/about/')).html).toContain('About us') // a trailing slash is the same page

    // renaming the slug moves the page
    const renamed = await api(`/api/_atelier/collections/pages/${created.body.id}`, 'PATCH', { version: 1, data: { slug: 'about-us' } })
    expect(renamed.body.path).toBe('/about-us')
    expect((await page('/about-us')).html).toContain('About us')
    expect((await fetch('/about', { redirect: 'manual' })).headers.get('location')).toBe('/about-us') // the old URL redirects

    const list = await api('/api/_atelier/collections/pages')
    expect(list.body.items.map((e: { path: string }) => e.path)).toEqual(['/about-us'])
  })

  it('serves each locale\'s pattern with the type\'s component and layout (Pruvious #73)', async () => {
    const { body } = await api('/api/_atelier/collections/projects', 'POST', { data: { name: 'Harbour', slug: 'harbour' } })
    expect(body.path).toBe('/projects/harbour')
    expect(body.paths).toEqual({ en: '/projects/harbour', et: '/projektid/harbour' })

    for (const path of ['/projects/harbour', '/projektid/harbour']) {
      const { status, html } = await page(path)
      expect(status).toBe(200)
      expect(html).toMatch(new RegExp(`<div class="layout-wide" data-entry="Harbour"><article class="project"><h1>Harbour</h1><p class="path">\\s*${path}\\s*</p></article></div>`))
    }
    const resolved = await api('/api/_atelier/routes?path=/projektid/harbour')
    expect(resolved.body).toMatchObject({ path: '/projektid/harbour', locale: 'et', kind: 'collection', name: 'projects', id: body.id, component: 'ProjectPage', layout: 'wide' })
  })

  it('serves a routable singleton', async () => {
    const saved = await api('/api/_atelier/singletons/home', 'PATCH', { version: null, data: { headline: 'Welcome', content: [{ id: 'h1', type: 'Hero', props: { title: 'Home' } }] } })
    expect(saved.body.path).toBe('/')
    expect((await page('/')).html).toMatch(/<h1 class="hero">\s*Home\s*<\/h1>/)
  })

  it('resolves rich-text links to entries by id, so they follow a rename', async () => {
    const team = await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'Team', slug: 'team' } })
    const link = (text: string, attrs: object) => ({ type: 'text', text, marks: [{ type: 'link', attrs }] })
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [
      link('our team', { to: 'pages', id: team.body.id }),
      link('home', { to: 'home' }),
      link('gone', { to: 'pages', id: 'no-such-entry', href: 'javascript:alert(1)' }),
    ] }] }
    const links = await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'Links', slug: 'links', content: [{ id: 't1', type: 'Text', props: { body } }] } })
    expect(links.status).toBe(200)
    const hrefs = async () => (await api(`/api/_atelier/collections/pages/${links.body.id}`)).body.data.content[0].props.body.content[0].content.map((n: { marks: { attrs: { href: unknown } }[] }) => n.marks[0]!.attrs.href)
    expect(await hrefs()).toEqual(['/team', '/', null]) // a link to nothing is no link, whatever href it was saved with
    expect((await page('/links')).html).toMatch(/<a href="\/team">our team<\/a><a href="\/">home<\/a>\s*gone/)

    // renaming the linked page changes the link, without saving the linking page again
    await api(`/api/_atelier/collections/pages/${team.body.id}`, 'PATCH', { version: 1, data: { slug: 'crew' } })
    expect(await hrefs()).toEqual(['/crew', '/', null])
    expect((await page('/links')).html).toContain('<a href="/crew">our team</a>')
  })

  it('refuses a URL another entry already has, per locale', async () => {
    const taken = await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'Again', slug: 'about-us' } })
    expect(taken.status).toBe(422)
    expect(taken.body.data.errors).toEqual([{ path: 'slug', message: expect.stringMatching(/^The URL \/about-us is already used by entry ".+" in "pages"$/) }])
    // "projects" is a page slug: /projects is free, /projects/harbour isn't reachable from pages
    expect((await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'Projects', slug: 'projects' } })).status).toBe(200)
  })

  it('leaves the app\'s own pages in front of entries with the same URL', async () => {
    const contact = await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'Contact', slug: 'contact' } })
    expect(contact.status).toBe(200)
    expect((await page('/contact')).html).toContain('<main class="host-contact">')
    // the admin's warning: which URLs an app page hides, and which page
    expect(contact.body.shadowed).toEqual([{ path: '/contact', page: '/contact' }])
    expect((await api(`/api/_atelier/collections/pages/${contact.body.id}`)).body.shadowed).toEqual([{ path: '/contact', page: '/contact' }])

    // a dynamic page hides a URL in every locale it matches
    const old = await api('/api/_atelier/collections/projects', 'POST', { data: { name: 'Old', slug: 'old' } })
    expect(old.body.shadowed).toEqual([{ path: '/projects/old', page: '/:section()/old' }, { path: '/projektid/old', page: '/:section()/old' }])
    expect((await page('/projektid/old')).html).toMatch(/<main class="host-old">\s*Archived \(projektid\)/)

    // entries no page hides carry no warning
    const list = await api('/api/_atelier/collections/pages')
    expect(list.body.items.filter((e: { shadowed?: unknown }) => e.shadowed).map((e: { path: string }) => e.path)).toEqual(['/contact'])
  })

  it('serves redirects before the page, automatic ones after a URL changes, and never to another host', async () => {
    const raw = (path: string) => fetch(path, { redirect: 'manual' })
    // the about page moved from /about to /about-us in the first test
    const auto = await raw('/about?ref=mail')
    expect(auto.status).toBe(301)
    expect(auto.headers.get('location')).toBe('/about-us?ref=mail')

    const created = await api('/api/_atelier/redirects', 'POST', { source: '/blog/:slug', target: '/news/:slug', status: 302 })
    expect(created.status).toBe(200)
    const moved = await raw('/blog/hello')
    expect([moved.status, moved.headers.get('location')]).toEqual([302, '/news/hello'])

    expect((await api('/api/_atelier/redirects', 'POST', { source: '/news/:slug', target: '/blog/:slug' })).body)
      .toMatchObject({ statusCode: 422, data: { code: 'validation_failed', errors: [{ path: 'target', message: 'This would make a loop: /news/x → /blog/x → /news/x' }] } })
    expect((await api('/api/_atelier/redirects', 'POST', { source: '/out', target: '//evil.example' })).status).toBe(422)

    // a catch-all redirect still can't send a request to another host (Pruvious #127)
    await api('/api/_atelier/redirects', 'POST', { source: '/go/*', target: '/*' })
    expect((await raw('/go/fine')).headers.get('location')).toBe('/fine')
    expect((await raw('/go//evil.example')).headers.get('location')).toBeNull()

    expect((await fetch('/api/_atelier/redirects')).status).toBe(401)
    expect((await api(`/api/_atelier/redirects/${created.body.id}`, 'DELETE')).body).toEqual({ ok: true })
    expect((await raw('/blog/hello')).status).toBe(404)
  })

  it('serves published posts to everyone, drafts to no one but editors who ask, and 404 once unpublished', async () => {
    const created = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Hello', slug: 'hello', content: [{ id: 'p1', type: 'Hero', props: { title: 'First words' } }] } })
    expect(created.body).toMatchObject({ version: 1, publishedVersion: null, path: '/blog/hello' })
    const { id } = created.body
    const post = `/api/_atelier/collections/posts/${id}`
    // a draft: not on the site, even for its editor, unless they ask for drafts
    expect((await page('/blog/hello')).status).toBe(404)
    expect((await api(post)).status).toBe(404)
    expect((await api(`${post}?draft=true`)).body.data.title).toBe('Hello')
    expect((await fetch(`${post}?draft=true`)).status).toBe(404) // a visitor asking for drafts gets what's published: nothing

    const published = await api(`${post}/publish`, 'POST', { version: 1 })
    expect(published.body).toMatchObject({ version: 2, publishedVersion: 2 })
    expect((await page('/blog/hello', false)).html).toMatch(/<h1 class="hero">\s*First words/) // visitors see it

    // the next draft stays off the site until it's published
    await api(post, 'PATCH', { version: 2, data: { content: [{ id: 'p1', type: 'Hero', props: { title: 'Second thoughts' } }] } })
    const visitor = await page('/blog/hello', false)
    expect(visitor.html).toContain('First words')
    expect(visitor.html).not.toContain('Second thoughts')
    expect((await (await fetch(`${post}?draft=true`)).json()).data.content[0].props.title).toBe('First words')
    expect((await api('/api/_atelier/routes?path=/blog/hello&draft=true')).body.entry.data.content[0].props.title).toBe('Second thoughts')
    expect((await api(`${post}`)).body).toMatchObject({ version: 2, publishedVersion: 2 })
    expect((await api(`${post}?draft=true`)).body).toMatchObject({ version: 3, publishedVersion: 2 })
    expect((await api(`${post}/revisions`)).body.map((r: { version: number, published: boolean }) => [r.version, r.published])).toEqual([[3, false], [2, true], [1, false]])
    expect((await api('/api/_atelier/audit?action=entry.published')).body[0]).toMatchObject({ action: 'entry.published', target: { type: 'posts', id }, details: { version: 2 } })

    // restoring the published version: a new draft with its content, the history kept
    const restored = await api(`${post}/revisions/2/restore`, 'POST', { version: 3 })
    expect(restored.body).toMatchObject({ version: 4, publishedVersion: 2, data: { content: [{ props: { title: 'First words' } }] } })
    expect((await api(`${post}/revisions`)).body.map((r: { version: number }) => r.version)).toEqual([4, 3, 2, 1])
    expect((await api(`${post}/revisions/2/restore`, 'POST', { version: 3 })).status).toBe(409)
    expect((await api(`${post}/revisions/99/restore`, 'POST', { version: 4 })).status).toBe(404)
    await api(post, 'PATCH', { version: 4, data: { content: [{ id: 'p1', type: 'Hero', props: { title: 'Second thoughts' } }] } })

    // unpublished: 404 for everyone, the draft stays
    expect((await api(`${post}/unpublish`, 'POST')).body).toMatchObject({ publishedVersion: null, version: 5 })
    expect((await page('/blog/hello', false)).status).toBe(404)
    expect((await page('/blog/hello')).status).toBe(404)
    expect((await api(`${post}?draft=true`)).body.data.content[0].props.title).toBe('Second thoughts')
    expect((await api('/api/_atelier/audit?action=entry.unpublished')).body[0]).toMatchObject({ target: { type: 'posts', id } })
    // a type that isn't versioned has nothing to publish
    expect((await api(`/api/_atelier/collections/pages/${(await api('/api/_atelier/collections/pages')).body.items[0].id}/unpublish`, 'POST')).status).toBe(422)
  })

  it('previews drafts on their real URL: for editors who ask, and for anyone with a shared link until it expires', async () => {
    const { body: draft } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Soon', slug: 'soon', content: [{ id: 's1', type: 'Hero', props: { title: 'Not yet public' } }] } })
    expect((await page('/blog/soon?_atelier=preview')).html).toContain('Not yet public') // an editor
    expect((await page('/blog/soon?_atelier=preview', false)).status).toBe(404) // a visitor asking

    const link = await api('/api/_atelier/preview-links', 'POST', { type: 'posts', id: draft.id, hours: 24 })
    expect(link.body).toMatchObject({ url: expect.stringMatching(/^\/blog\/soon\?_atelier_preview=[\w-]+\.[\w-]+$/), expiresAt: expect.any(String) })
    expect(Date.parse(link.body.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3600_000)
    const shared = await page(link.body.url, false)
    expect(shared.status).toBe(200)
    expect(shared.html).toContain('Not yet public')

    // the link shows that entry only, and only as signed
    const { body: other } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Other', slug: 'other' } })
    expect((await page(`/blog/other?_atelier_preview=${link.body.token}`, false)).status).toBe(404)
    expect((await page(`/blog/soon?_atelier_preview=${link.body.token.slice(0, -2)}xx`, false)).status).toBe(404)
    const forged = await signToken(PREVIEW_PURPOSE, { t: 'posts', i: draft.id, e: Date.now() + 3600_000 }, await derived(PREVIEW_PURPOSE, 'another-secret-that-is-long-enough-1234'))
    expect((await page(`/blog/soon?_atelier_preview=${forged}`, false)).status).toBe(404)

    // a 24-hour link opened after 25 hours: the expiry message, no draft content
    const expired = await signToken(PREVIEW_PURPOSE, { t: 'posts', i: draft.id, e: Date.now() - 3600_000 }, await derived(PREVIEW_PURPOSE))
    const late = await page(`/blog/soon?_atelier_preview=${expired}`, false)
    expect(late.status).toBe(410)
    expect(late.html).toContain('Preview link expired')
    expect(late.html).not.toContain('Not yet public')
    expect((await (await fetch(`/api/_atelier/routes?path=/blog/soon&preview=${expired}`)).json()).data.code).toBe('preview_expired')

    // who may make one
    expect((await api('/api/_atelier/preview-links', 'POST', { type: 'posts', id: other.id, hours: 721 })).status).toBe(422)
    expect((await fetch('/api/_atelier/preview-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'posts', id: draft.id }) })).status).toBe(401)
  })

  it('caches what visitors see until content changes, never drafts or signed-in answers, and tells the app\'s hooks', async () => {
    const { body: post } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Cached', slug: 'cached', content: [{ id: 'k1', type: 'Hero', props: { title: 'Version one' } }] }, publish: true })
    const visitor = () => fetch('/api/_atelier/routes?path=/blog/cached')
    expect((await (await visitor()).json()).entry.data.content[0].props.title).toBe('Version one')

    // a change behind the store's back isn't seen by visitors: they're served from the cache
    const db = await connectEngine(`file:${DATABASE}`)
    await query(db, sql`update atelier_p_posts set title = ${'Changed behind its back'} where _id = ${post.id}`)
    expect((await (await visitor()).json()).entry.data.title).toBe('Cached')
    const signedIn = await fetch('/api/_atelier/routes?path=/blog/cached', { headers: { cookie } })
    expect(signedIn.headers.get('cache-control')).toBe('private, no-store')
    expect((await signedIn.json()).entry.data.title).toBe('Changed behind its back')
    await db.close()

    // republishing clears it
    const draft = await api(`/api/_atelier/collections/posts/${post.id}`, 'PATCH', { version: 1, data: { content: [{ id: 'k1', type: 'Hero', props: { title: 'Version two' } }] }, publish: true })
    expect(draft.body).toMatchObject({ version: 2, publishedVersion: 2 })
    expect((await page('/blog/cached', false)).html).toContain('Version two')
    expect((await (await fetch('/api/_atelier/routes?path=/blog/cached&draft=true', { headers: { cookie } })).headers.get('cache-control'))).toBe('private, no-store')

    const changes = await (await fetch('/api/test/changes')).json()
    expect(changes.filter((c: { id: string }) => c.id === post.id)).toEqual([
      { type: 'posts', id: post.id, action: 'published', live: true },
      { type: 'posts', id: post.id, action: 'published', live: true },
    ])
    await api(`/api/_atelier/collections/posts/${post.id}`, 'PATCH', { version: 2, data: { title: 'Draft only' } })
    expect((await (await fetch('/api/test/changes')).json()).at(-1)).toEqual({ type: 'posts', id: post.id, action: 'saved', live: false })
  })

  it('answers 404 for unknown and protocol-relative paths; visitors read what\'s published but can\'t write', async () => {
    expect((await page('/nothing-here')).status).toBe(404)
    expect((await api('/api/_atelier/routes?path=//evil.example')).status).toBe(404)
    const missing = await api('/api/_atelier/routes?path=/nothing-here')
    expect(missing.body).toMatchObject({ statusCode: 404, data: { code: 'not_found' } })
    // not signed in: the public role, which reads every type by default
    expect((await (await fetch('/api/_atelier/routes?path=/about-us')).json()).entry.data.title).toBe('About')
    expect((await page('/about-us', false)).html).toContain('About us')
    expect((await fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { title: 'Spam', slug: 'spam' } }) })).status).toBe(401)
  })
})
