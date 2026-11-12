// Localized routes through an i18n module's adapter, run against a fixture per module
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetch, setup, startServer } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

export function i18nSuite(label: string, rootDir: string) {
  describe(`localized routes (${label})`, async () => {
    await setup({ setupTimeout: 300_000, rootDir })
    const page = async (path: string) => {
      const response = await fetch(path)
      return { status: response.status, html: (await response.text()).replace(/<!--[[\]]-->/g, '') }
    }

    beforeAll(async () => {
      await startServer({ env: {
        NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-i18n-')), 'db.sqlite')}`,
        NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      } })
      expect((await fetch('/api/test/seed', { method: 'POST' })).status).toBe(200)
    })

    it('serves each locale\'s version under its prefix, with fallbacks', async () => {
      const english = await page('/products/chair')
      expect(english.status).toBe(200)
      expect(english.html).toContain('<h1>Chair</h1>')
      const german = await page('/de/produkte/stuhl')
      expect(german.status).toBe(200)
      expect(german.html).toContain('<h1>Stuhl</h1>')
      expect(german.html).toContain('Sit down') // the subtitle, from English
      expect(german.html).toContain('de {&quot;subtitle&quot;:&quot;en&quot;}')
      expect(german.html).toContain('href="/de/produkte/stuhl"') // useAtelierLocalePath
      // both pages link both translations, prefixed as the i18n module wants
      for (const html of [english.html, german.html]) {
        expect(html).toMatch(/<link[^>]*hreflang="en"[^>]*href="\/products\/chair"|<link[^>]*href="\/products\/chair"[^>]*hreflang="en"/)
        expect(html).toMatch(/<link[^>]*hreflang="de"[^>]*href="\/de\/produkte\/stuhl"|<link[^>]*href="\/de\/produkte\/stuhl"[^>]*hreflang="de"/)
      }
    })

    it('answers 404 for a version under another locale\'s prefix', async () => {
      expect((await page('/produkte/stuhl')).status).toBe(404) // German, without its prefix
      expect((await page('/de/products/chair')).status).toBe(404)
    })

    it('serves an entry that isn\'t localized in every locale', async () => {
      expect((await page('/about')).html).toContain('<h1>About us</h1>')
      expect((await page('/de/about')).html).toContain('<h1>About us</h1>')
    })
  })
}
