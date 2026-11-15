// The CMS's JavaScript budget on a public page (test/fixtures/ui-css: blocks in plain CSS): at most 15 KB
// gzip of what the browser downloads comes from Nuxt Atelier (its runtime and the libraries only it
// brings), and none of it from the editor or the admin. Nuxt mixes our code into its chunks, so each chunk
// loaded is split by its source map, and its gzip size shared out in proportion.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { attribute } from './sourcemap'

const BUDGET = 15 * 1024
/** What counts as the CMS: our packages' runtime, its generated templates, and libraries only it brings. */
const isCms = (source: string) => /\/packages\/[^/]+\/(?:src|dist)\/runtime\/|(?:\/|%2F)atelier(?:\/|%2F)[\w-]+\.mjs|\/node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?(?:valibot|@tanstack)\//.test(source)
/** Never on a public page. */
const isEditing = (source: string) => /\/packages\/core\/(?:src|dist)\/runtime\/app\/editor\/(?!frames)|\/packages\/(?:admin|editor|ai)\//.test(source)

describe('client JS budget', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/ui-css', import.meta.url)), browser: true })

  it('keeps the CMS\'s JS on a public page within 15 KB gzip, with no editing code', async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-budget-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
    const signedIn = await fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) })
    const cookies = signedIn.headers.getSetCookie().map(c => c.split(';')[0]!)
    const saved = await fetch('/api/_atelier/collections/pages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': cookies.join('; '), 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! },
      body: JSON.stringify({ data: { title: 'Home', content: [
        { id: 'hero', type: 'Hero', props: { title: 'Build with blocks', tagline: 'Any UI library.', actions: [{ id: 'go', type: 'Cta', props: { label: 'Get started', to: '/docs' } }] } },
        { id: 'f1', type: 'Feature', props: { title: 'Typed', body: 'Fields are props.' } },
      ] }, publish: true }),
    })
    const { id } = await saved.json() as { id: string }

    // a visitor's page: every script it downloads, until the network is quiet (blocks load lazily)
    const page = await createPage()
    const scripts = new Map<string, Promise<string>>()
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script' && response.url().startsWith(url('/')))
        scripts.set(response.url(), response.text())
    })
    await page.goto(url(`/${id}`), { waitUntil: 'networkidle' })
    await page.getByText('Fields are props.').waitFor()

    let cms = 0
    let total = 0
    const editing = new Set<string>()
    for (const [src, body] of scripts) {
      const code = await body
      const map = await $fetch<{ sources: string[], mappings: string }>(`${new URL(src).pathname}.map`)
      const bytes = attribute(code, map)
      const gzip = gzipSync(code).length
      const all = [...bytes.values()].reduce((a, b) => a + b, 0) || 1
      const ours = [...bytes].filter(([source]) => isCms(source)).reduce((a, [, n]) => a + n, 0)
      cms += gzip * ours / all
      total += gzip
      for (const source of bytes.keys()) {
        if (isEditing(source))
          editing.add(source)
      }
    }
    console.info(`[budget] the CMS's JS on a public page: ${(cms / 1024).toFixed(1)} KB gzip of ${(total / 1024).toFixed(1)} KB (budget ${BUDGET / 1024} KB)`)
    expect(scripts.size).toBeGreaterThan(0)
    expect([...editing]).toEqual([])
    expect(cms).toBeLessThanOrEqual(BUDGET)
  })
})
