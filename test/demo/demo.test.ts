// Demo mode (test/fixtures/demo): each visitor's demo is a copy of the site of their own, signed in as its
// administrator; their edits show to them alone, never to the site or another demo, and are gone when the
// demo idles out. The site takes no changes from outside a demo, and no demo can upload a file.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

describe('demo mode', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/demo', import.meta.url)) })
  let pageId = ''

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-demo-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    pageId = (await $fetch<{ id: string }>('/api/test/template', { method: 'POST' })).id
  })

  /** A visitor starting a demo: their cookies, and the headers to make changes with them. */
  async function startDemo() {
    const started = await fetch('/api/_atelier/demo/start?to=/welcome', { redirect: 'manual' })
    expect(started.status).toBe(302)
    expect(started.headers.get('location')).toBe('/welcome')
    const cookies = started.headers.getSetCookie().map(c => c.split(';')[0]!)
    const cookie = cookies.join('; ')
    return { cookie, write: { 'content-type': 'application/json', cookie, 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! } }
  }
  const titleFor = async (cookie?: string) => (await (await fetch(`/api/_atelier/collections/pages/${pageId}`, { headers: cookie ? { cookie } : {} })).json() as { data: { title: string } }).data.title

  it('gives each demo a copy of its own: edits show to that visitor alone', async () => {
    const a = await startDemo()
    const b = await startDemo()
    expect(await (await fetch('/api/_atelier/auth/me', { headers: { cookie: a.cookie } })).json()).toMatchObject({ user: { email: 'demo@nuxt-atelier.dev', role: 'admin' } })
    const current = await (await fetch(`/api/_atelier/collections/pages/${pageId}`, { headers: { cookie: a.cookie } })).json() as { version: number }
    const saved = await fetch(`/api/_atelier/collections/pages/${pageId}`, { method: 'PATCH', headers: a.write, body: JSON.stringify({ version: current.version, data: { title: 'A changed it' } }) })
    expect(saved.status).toBe(200)

    expect(await titleFor(a.cookie)).toBe('A changed it')
    expect(await titleFor(b.cookie)).toBe('Template title')
    expect(await titleFor()).toBe('Template title') // the site itself

    // a demo ends on request, and its copy with it
    expect((await fetch('/api/_atelier/demo', { method: 'DELETE', headers: b.write })).status).toBe(200)
    expect(await (await fetch('/api/_atelier/demo', { headers: { cookie: b.cookie } })).json()).toMatchObject({ active: false })
  })

  it('never lets a demo\'s copy into what other visitors are served from cache', async () => {
    const a = await startDemo()
    const current = await (await fetch(`/api/_atelier/collections/pages/${pageId}`, { headers: { cookie: a.cookie } })).json() as { version: number }
    expect((await fetch(`/api/_atelier/collections/pages/${pageId}`, { method: 'PATCH', headers: a.write, body: JSON.stringify({ version: current.version, data: { title: 'Defaced' } }) })).status).toBe(200)
    // the visitor reads the page as the public would (only the demo cookie): from their copy, not cached
    const demoOnly = a.cookie.split('; ').filter(c => c.startsWith('atelier-demo=')).join('; ')
    const theirs = await (await fetch('/api/_atelier/routes?path=/welcome', { headers: { cookie: demoOnly } })).json() as { entry: { data: { title: string } } }
    expect(theirs.entry.data.title).toBe('Defaced')
    // everyone else: the site's own content
    for (let i = 0; i < 2; i++) {
      const site = await (await fetch('/api/_atelier/routes?path=/welcome')).json() as { entry: { data: { title: string } } }
      expect(site.entry.data.title).toBe('Template title')
    }
    expect((await fetch('/api/_atelier/demo', { method: 'DELETE', headers: a.write })).status).toBe(200)
  })

  it('takes no changes outside a demo, and no files in one', async () => {
    const login = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@nuxt-atelier.dev', password: 'anything' }) })
    expect(login.status).toBe(403)
    expect(await login.json()).toMatchObject({ data: { code: 'demo' } })
    const a = await startDemo()
    const upload = await fetch('/api/_atelier/media?filename=photo.png', { method: 'POST', headers: { ...a.write, 'content-type': 'image/png' }, body: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0)) })
    expect(upload.status).toBe(403)
    expect(await upload.text()).toContain('off in the demo')
  })

  it('limits demos per address, and lets the admin be framed by the docs', async () => {
    // three are open from this address (perAddress: 3): A's from the first test ended? B's did; A's and the
    // second test's are open, so one more fits and the next is refused
    await startDemo()
    const refused = await fetch('/api/_atelier/demo/start', { redirect: 'manual' })
    expect(refused.status).toBe(429)
    const admin = await fetch('/admin')
    expect(admin.headers.get('content-security-policy')).toContain('frame-ancestors \'self\' https://docs.example.com')
  })

  it('deletes an idle demo, edits and all', async () => {
    const a = await startDemo().catch(() => undefined)
    // whichever demo: wait out the idle timeout (10 s) and the sweep (every 5 s)
    await new Promise(resolve => setTimeout(resolve, 17_000))
    if (a)
      expect(await (await fetch('/api/_atelier/demo', { headers: { cookie: a.cookie } })).json()).toMatchObject({ active: false })
    const fresh = await startDemo() // room again
    expect(await titleFor(fresh.cookie)).toBe('Template title')
  }, 60_000)
})
