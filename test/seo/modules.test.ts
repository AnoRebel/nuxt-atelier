// With @nuxtjs/robots and @nuxtjs/sitemap installed, the CMS's robots rules and pages go through them.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

describe('with @nuxtjs/robots and @nuxtjs/sitemap', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/seo-modules', import.meta.url)), setupTimeout: 300_000 })

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-seo-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/page', { method: 'POST', body: { title: 'Hello', slug: 'hello' } })
  })

  it('adds the CMS rules to the module\'s robots.txt, the admin and API kept out', async () => {
    const robots = await $fetch<string>('/robots.txt', { responseType: 'text' })
    expect(robots).toMatch(/Disallow: \/admin/)
    expect(robots).toMatch(/Disallow: \/api\/_atelier\//)
    expect(robots).toMatch(/User-agent: GPTBot[\s\S]*Disallow: \/(?:\n|$)/)
  })

  it('adds the CMS pages to the module\'s sitemap', async () => {
    const xml = await $fetch<string>('/sitemap.xml', { responseType: 'text' })
    expect(xml).toContain('<loc>https://example.com/hello</loc>')
  })
})
