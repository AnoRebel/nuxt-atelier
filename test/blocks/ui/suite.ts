// One page of content rendered by four apps, each with blocks built on a different UI library
// (test/fixtures/ui-*). Same block names and fields, so the same entry validates and renders in each.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const content = [
  { id: 'hero', type: 'Hero', props: { title: 'Build with blocks', tagline: 'One schema, any UI library.', variant: 'muted', actions: [
    { id: 'start', type: 'Cta', props: { label: 'Get started', to: '/docs' } },
    { id: 'source', type: 'Cta', props: { label: 'Source', to: '/source', variant: 'outline' } },
  ] } },
  { id: 'typed', type: 'Feature', props: { title: 'Typed', body: 'Fields are props.' } },
  { id: 'portable', type: 'Feature', props: { title: 'Portable', body: 'Swap the UI, keep the content.' } },
]

/** The rendered <main>, without what changes between builds: SSR fragment markers and scoped-style hashes. */
const normalise = (html: string) => html.match(/<main>[\s\S]*<\/main>/)![0]
  .replace(/<!--[[\]]?-->/g, '')
  .replace(/ data-v-[a-f0-9]{8}(?:="")?/g, '')

export function uiSuite(library: string) {
  describe(`blocks rendered with ${library}`, async () => {
    await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL(`../../fixtures/ui-${library}`, import.meta.url)), browser: true })
    let id = ''
    let cookies: string[] = [] // drafts are readable only signed in

    beforeAll(async () => {
      await startServer({ env: {
        NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-ui-')), 'db.sqlite')}`,
        NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      } })
      await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
      const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
      cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
      const saved = await fetch('/api/_atelier/collections/pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': cookies.join('; '), 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! },
        body: JSON.stringify({ data: { title: 'Home', content } }),
      })
      expect(saved.status).toBe(200)
      id = (await saved.json()).id
    })

    it('renders the shared content, matching its snapshot', async () => {
      const main = normalise(await (await fetch(`/${id}`, { headers: { cookie: cookies.join('; ') } })).text())
      // the same text and links whatever the library
      expect(main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .toBe('Build with blocks One schema, any UI library. Get started Source Typed Fields are props. Portable Swap the UI, keep the content.')
      expect([...main.matchAll(/href="([^"]+)"/g)].map(m => m[1])).toEqual(['/docs', '/source'])
      await expect(main).toMatchFileSnapshot(`__snapshots__/${library}.html`)
    })

    it('hydrates without mismatches, with the library\'s styles applied', async () => {
      const page = await createPage()
      await page.context().addCookies(cookies.map((c) => {
        const [name, value] = c.split('=') as [string, string]
        return { name, value, url: url('/') }
      }))
      const warnings: string[] = []
      page.on('console', message => message.type() === 'warning' && warnings.push(message.text()))
      await page.goto(url(`/${id}`), { waitUntil: 'networkidle' })
      expect(warnings.filter(w => /hydration/i.test(w))).toEqual([])
      // the hero's title is sized by the library's CSS (Tailwind utilities, Nuxt UI's theme or scoped CSS): 3rem
      // or more, where the browser's own h1 style is 2em (32px)
      expect(await page.locator('main h1').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(48)
      await page.close()
    })
  })
}
