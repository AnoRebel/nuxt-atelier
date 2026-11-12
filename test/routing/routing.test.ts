import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { sql } from 'drizzle-orm'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { PREVIEW_PURPOSE, signToken } from '../../packages/core/src/runtime/server/secrets'
import { sign } from '../../packages/core/src/runtime/server/webhooks'
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
      NUXT_ATELIER_JOBS_SECRET: 'a-jobs-secret',
      NUXT_ATELIER_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'atelier-routing-uploads-')),
      // Nitro skips its scheduler in a test environment (std-env's isTest): run this server as production
      NODE_ENV: 'production',
      TEST: '',
      VITEST: '',
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

  it('renders search and social metadata on the server, from the seo field or the entry', async () => {
    const plain = (await page('/about-us', false)).html // the first test's page: title only
    expect(plain).toContain('<title>About · Atelier</title>')
    expect(plain).toContain('<link rel="canonical" href="/about-us">')
    expect(plain).toMatch(/<meta property="og:title" content="About">/)
    const post = await api('/api/_atelier/collections/posts', 'POST', { publish: true, data: { title: 'Launch', slug: 'launch', seo: { title: 'We launched', description: 'All about the launch', noindex: true } } })
    expect(post.status).toBe(200)
    const html = (await page('/blog/launch', false)).html
    expect(html).toContain('<title>We launched · Atelier</title>')
    expect(html).toMatch(/<meta name="description" content="All about the launch">/)
    expect(html).toMatch(/<meta property="og:description" content="All about the launch">/)
    expect(html).toMatch(/<meta name="robots" content="noindex">/)
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

  it('runs background jobs on Nitro\'s scheduler, and from the trigger endpoint within its time budget', async () => {
    const notes = async () => await (await fetch('/api/test/jobs')).json() as string[]
    // the scheduler (every 2 s here) runs a due job with nobody calling anything
    await $fetch('/api/test/jobs', { method: 'POST', body: { notes: ['scheduled'] } })
    await expect.poll(notes, { timeout: 15_000, interval: 250 }).toContain('scheduled')

    const trigger = (secret?: string) => fetch('/api/_atelier/jobs/run', { method: 'POST', headers: secret ? { authorization: `Bearer ${secret}` } : {} })
    expect((await trigger()).status).toBe(401)
    expect((await trigger('wrong')).status).toBe(401)

    // twelve 1.5 s jobs, four at a time: a 1 s budget starts one batch and leaves the rest queued
    const slow = Array.from({ length: 12 }, (_, i) => `slow ${i}`)
    await $fetch('/api/test/jobs', { method: 'POST', body: { notes: slow, ms: 1500 } })
    const started = Date.now()
    const response = await trigger('a-jobs-secret')
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(Date.now() - started).toBeLessThan(1000 + 1500 + 4000) // the budget, the jobs it started, and slack for a busy machine
    expect(result.ran).toBeLessThan(12)
    const left = await api('/api/_atelier/jobs')
    expect(left.body.filter((j: { name: string }) => j.name === 'test:note').length).toBeGreaterThan(0) // still queued, or being run by the scheduler
    await expect.poll(async () => (await notes()).filter(n => n.startsWith('slow')).length, { timeout: 30_000, interval: 500 }).toBe(12)
    expect((await fetch('/api/_atelier/jobs')).status).toBe(401) // the job list is for administrators
  })

  it('schedules publishing through the API, and the scheduler publishes on time', async () => {
    const { body: post } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Timed', slug: 'timed' } })
    const schedule = `/api/_atelier/collections/posts/${post.id}/schedule`
    const soon = new Date(Date.now() + 3000).toISOString()
    expect((await api(schedule, 'POST', { action: 'publish', at: '2020-01-01T00:00:00Z', version: 1 })).body.data.errors).toEqual([{ path: 'at', message: 'in the past' }])
    expect((await api(schedule, 'POST', { action: 'publish', at: soon })).body.data.errors).toEqual([{ path: 'version', message: 'required' }])
    expect((await api(schedule, 'POST', { action: 'publish', at: '2026-11-10T09:00', version: 1 })).status).toBe(422) // no offset: ambiguous
    expect((await api(`/api/_atelier/collections/pages/${(await api('/api/_atelier/collections/pages')).body.items[0].id}/schedule`, 'POST', { action: 'publish', at: soon, version: 1 })).status).toBe(422) // not versioned
    expect((await fetch(schedule)).status).toBe(403) // visitors can't see schedules

    const scheduled = await api(schedule, 'POST', { action: 'publish', at: soon, version: 1 })
    expect(scheduled.body).toEqual([{ action: 'publish', at: soon, version: 1, by: expect.any(String), status: 'queued', lastError: null }])
    expect((await api(schedule)).body).toEqual(scheduled.body)
    expect((await page('/blog/timed', false)).status).toBe(404)
    await expect.poll(async () => (await page('/blog/timed', false)).status, { timeout: 20_000, interval: 500 }).toBe(200)
    expect((await api(schedule)).body).toEqual([])
    expect((await api(`${schedule}/unpublish`, 'DELETE')).status).toBe(404)
  })

  it('runs lifecycle hooks: a before-hook\'s error reaches the client, a failing after-hook is logged and the write kept', async () => {
    const refused = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Forbidden', slug: 'forbidden' } })
    expect(refused.status).toBe(422)
    expect(refused.body).toMatchObject({ message: 'A post can\'t be called "Forbidden"', data: { errors: [{ path: 'title', message: 'not allowed' }] } })
    expect((await api('/api/_atelier/collections/posts?draft=true&filter={"slug":{"eq":"forbidden"}}')).body.items).toEqual([])

    const exploded = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Explode', slug: 'explode' }, publish: true })
    expect(exploded.status).toBe(200)
    expect((await page('/blog/explode', false)).status).toBe(200)
    const [failure] = (await api('/api/_atelier/audit?action=hook.failed')).body
    expect(failure).toMatchObject({ target: { type: 'posts', id: exploded.body.id }, details: { hook: 'atelier:afterPublish', error: 'the after-publish hook exploded' } })
  })

  it('delivers signed webhooks for published posts through the job queue, logging each attempt, and refuses internal targets', async () => {
    const received: { path: string, headers: Record<string, string | string[] | undefined>, body: string }[] = []
    const receiver = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        received.push({ path: req.url!, headers: req.headers, body })
        res.statusCode = req.url === '/fail' ? 500 : 204
        res.end()
      })
    })
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(receiver.address() as { port: number }).port}`
    try {
      expect((await api('/api/_atelier/webhooks', 'POST', { url: 'http://10.0.0.1/hook', events: ['entry.published'] })).body.data.errors[0])
        .toEqual({ path: 'url', message: '10.0.0.1 is an internal address; allowlist it in webhooks.allow if that\'s intended' })
      expect((await api('/api/_atelier/webhooks', 'POST', { url: 'http://127.0.0.2/hook', events: ['entry.published'] })).status).toBe(422)
      expect((await api('/api/_atelier/webhooks', 'POST', { url: `${base}/hook`, events: ['entry.published'], types: ['nope'] })).body.data.errors).toEqual([{ path: 'types.0', message: 'No collection or singleton "nope"' }])

      const hook = (await api('/api/_atelier/webhooks', 'POST', { url: `${base}/hook`, events: ['entry.published'], types: ['posts'] })).body
      expect(hook).toMatchObject({ url: `${base}/hook`, events: ['entry.published'], types: ['posts'], active: true, secret: expect.stringMatching(/^whsec_/) })
      const failing = (await api('/api/_atelier/webhooks', 'POST', { url: `${base}/fail`, events: ['entry.published'] })).body
      expect((await api('/api/_atelier/webhooks')).body.every((w: object) => !('secret' in w))).toBe(true) // shown once

      const { body: post } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Hooked', slug: 'hooked' }, publish: true })
      await expect.poll(() => received.filter(r => r.path === '/hook').length, { timeout: 20_000, interval: 250 }).toBe(1)
      const delivery = received.find(r => r.path === '/hook')!
      const [id, timestamp, signature] = ['webhook-id', 'webhook-timestamp', 'webhook-signature'].map(h => delivery.headers[h] as string)
      expect(signature).toBe(await sign(hook.secret, id!, Number(timestamp), delivery.body)) // verifiable with the secret
      expect(JSON.parse(delivery.body)).toMatchObject({ type: 'entry.published', data: { type: 'posts', id: post.id, live: true } })

      expect((await api(`/api/_atelier/webhooks/${hook.id}/deliveries`)).body).toEqual([expect.objectContaining({ messageId: id, event: 'entry.published', attempt: 1, status: 204, error: null })])
      await expect.poll(async () => (await api(`/api/_atelier/webhooks/${failing.id}/deliveries`)).body[0]?.error, { timeout: 20_000, interval: 250 }).toBe('Answered 500')
      expect((await api('/api/_atelier/jobs?status=queued')).body.some((j: { name: string }) => j.name === 'atelier:webhook')).toBe(true) // retried later

      expect((await fetch('/api/_atelier/webhooks')).status).toBe(401)
      expect((await api(`/api/_atelier/webhooks/${failing.id}`, 'DELETE')).body).toEqual({ ok: true })
    }
    finally {
      receiver.close()
    }
  })

  it('uploads media, judged by content, serves it with immutable caching, and keeps private files from visitors', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    const upload = async (body: Uint8Array<ArrayBuffer>, query: string) => {
      const response = await fetch(`/api/_atelier/media?${query}`, { method: 'POST', headers: { cookie, 'x-atelier-csrf': csrf }, body: new Blob([body]) })
      return { status: response.status, body: await response.json() }
    }
    expect((await fetch('/api/_atelier/media')).status).toBe(401)

    const photo = await upload(png, 'filename=team.png&folder=people')
    expect(photo.body).toMatchObject({ mime: 'image/png', size: png.length, folder: 'people', private: false, url: `/_atelier/media/${photo.body.id}/team.png` })
    expect(photo.body).not.toHaveProperty('key')
    const served = await fetch(photo.body.url)
    expect([served.status, served.headers.get('content-type'), served.headers.get('cache-control')]).toEqual([200, 'image/png', 'public, max-age=31536000, immutable'])
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
    expect((await fetch(`/_atelier/media/${photo.body.id}/other-name.png`)).status).toBe(404)

    const exe = new Uint8Array(512)
    exe.set([0x4D, 0x5A])
    exe.set([0x80, 0, 0, 0], 0x3C)
    exe.set([0x50, 0x45, 0, 0], 0x80)
    expect((await upload(exe, 'filename=photo.jpg')).body).toMatchObject({ statusCode: 415, data: { code: 'unsupported_type' } })

    expect((await api(`/api/_atelier/media/${photo.body.id}`, 'PATCH', { tags: ['team', 'team'], alt: { en: 'The team' } })).body).toMatchObject({ tags: ['team'], alt: { en: 'The team' } })
    const tagged = await api(`/api/_atelier/media?filter=${encodeURIComponent(JSON.stringify({ tags: { contains: 'team' } }))}`)
    expect(tagged.body.items.map((i: { id: string }) => i.id)).toEqual([photo.body.id])

    const secret = await upload(png, 'filename=contract.png&private=true')
    expect((await fetch(secret.body.url)).status).toBe(404) // a visitor: as if it didn't exist
    const signedIn = await fetch(secret.body.url, { headers: { cookie } })
    expect([signedIn.status, signedIn.headers.get('cache-control')]).toEqual([200, 'private, no-store'])

    // a real image: measured at upload, and served as variants made with sharp
    const wide = new Uint8Array(await sharp({ create: { width: 800, height: 400, channels: 3, background: '#3366cc' } }).png().toBuffer())
    const picture = (await upload(wide, 'filename=wide.png')).body
    expect(picture).toMatchObject({ width: 800, height: 400 })
    const square = await fetch(`${picture.url}?w=320&ar=1:1&format=webp`)
    expect([square.status, square.headers.get('content-type'), square.headers.get('cache-control')]).toEqual([200, 'image/webp', 'public, max-age=31536000, immutable'])
    expect(await sharp(new Uint8Array(await square.arrayBuffer())).metadata()).toMatchObject({ width: 320, height: 320, format: 'webp' })
    // a page showing it: the entry carries its media, rendered as a sized, responsive image
    await api(`/api/_atelier/media/${picture.id}`, 'PATCH', { alt: { '': 'A blue field' } })
    const { body: shown } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'Pictured', slug: 'pictured', content: [{ id: 'ph', type: 'Photo', props: { image: picture.id } }] }, publish: true })
    expect((await (await fetch(`/api/_atelier/collections/posts/${shown.id}`)).json()).media).toEqual({ [picture.id]: expect.objectContaining({ url: picture.url, width: 800, height: 400, alt: { '': 'A blue field' } }) })
    const html = (await page('/blog/pictured', false)).html
    const img = /<img [^>]*>/.exec(html.slice(html.indexOf('class="photo"')))![0]
    expect(img).toContain(`src="${picture.url}?w=640&amp;ar=1:1"`) // the full size, for browsers without srcset
    expect(img).toMatch(/width="400" height="400"/)
    expect(img).toContain('alt="A blue field"')
    expect(img).toContain(`srcset="${picture.url}?w=320&amp;ar=1:1 320w, ${picture.url}?w=640&amp;ar=1:1 400w"`)
    expect(img).toContain('sizes="50vw"')
    expect(img).toContain('loading="lazy"')
    expect((await fetch(`${picture.url}?w=333`)).status).toBe(400) // only the configured widths
    expect((await fetch(`${picture.url}?w=320&ar=5:1`)).status).toBe(400)

    // in use: deleting it lists where, and needs ?force=true
    const { body: post } = await api('/api/_atelier/collections/posts', 'POST', { data: { title: 'With a cover', slug: 'with-cover', cover: photo.body.id } })
    expect((await api(`/api/_atelier/media/${photo.body.id}/usage`)).body).toEqual([{ type: 'posts', id: post.id, field: 'cover' }])
    const refused = await api(`/api/_atelier/media/${photo.body.id}`, 'DELETE')
    expect(refused.body).toMatchObject({ statusCode: 409, data: { code: 'referenced', usages: [{ type: 'posts', id: post.id, field: 'cover' }] } })
    expect((await fetch(photo.body.url)).status).toBe(200)
    // a resumable upload: chunks at offsets, the wrong one answered with where to continue
    const big = new Uint8Array(250_000)
    big.set(png)
    for (let i = png.length; i < big.length; i++)
      big[i] = i % 251
    const started = (await api('/api/_atelier/media/uploads', 'POST', { filename: 'big.png', size: big.length })).body
    expect(started).toMatchObject({ received: 0, size: big.length })
    const chunk = async (offset: number, bytes: Uint8Array<ArrayBuffer>) => {
      const response = await fetch(`/api/_atelier/media/uploads/${started.id}?offset=${offset}`, { method: 'PUT', headers: { cookie, 'x-atelier-csrf': csrf }, body: new Blob([bytes]) })
      return { status: response.status, body: await response.json() }
    }
    expect((await chunk(0, big.slice(0, 100_000))).body).toMatchObject({ received: 100_000 })
    expect((await chunk(0, big.slice(0, 100_000))).body).toMatchObject({ statusCode: 409, data: { received: 100_000 } }) // sent twice: refused
    await chunk(100_000, big.slice(100_000))
    const finished = (await api(`/api/_atelier/media/uploads/${started.id}/complete`, 'POST')).body
    expect(finished).toMatchObject({ mime: 'image/png', size: big.length })
    expect(new Uint8Array(await (await fetch(finished.url)).arrayBuffer())).toEqual(big)

    expect((await api(`/api/_atelier/media/${photo.body.id}?force=true`, 'DELETE')).body).toEqual({ ok: true })
    expect((await fetch(photo.body.url)).status).toBe(404)
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
    // a JSON body past limits.maxBodySize (1 MB): refused before it's read whole
    const huge = await api('/api/_atelier/collections/pages', 'POST', { data: { title: 'x'.repeat(1_100_000), slug: 'huge' } })
    expect(huge.body).toMatchObject({ statusCode: 413, data: { code: 'too_large' } })
  })
})
