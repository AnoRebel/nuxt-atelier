// The admin over a site with hostile global CSS (test/fixtures/admin): first-run setup, creating and listing
// an entry, style isolation both ways, and no passkey code when passkeys are off.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/admin', import.meta.url))

describe('admin', async () => {
  await setup({ rootDir, browser: true, setupTimeout: 300_000 })

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-admin-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
  })

  it('is served client-side only, never indexed', async () => {
    const response = await fetch('/admin/collections/posts')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await response.text()).not.toContain('data-atelier-admin') // nothing rendered on the server
  })

  it('creates the first administrator, then an entry, and lists it', async () => {
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Create administrator' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

    await page.getByRole('link', { name: 'Posts' }).first().click()
    await page.getByRole('link', { name: 'New' }).click()
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByLabel('Title *').and(page.locator('[aria-invalid="true"]')).waitFor() // title is required
    await page.getByLabel('Title *').fill('Hello world')
    await page.getByLabel('Category').selectOption('news')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)

    await page.goto(url('/admin/collections/posts'))
    await page.getByRole('link', { name: 'Hello world' }).waitFor()
    expect(await page.getByRole('row').filter({ hasText: 'Hello world' }).textContent()).toContain('Draft')
  })

  it('keeps the site\'s CSS out of the admin, and the admin\'s CSS off the site\'s pages', async () => {
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').waitFor()
    const input = await page.getByLabel('Email').evaluate((el) => {
      const style = getComputedStyle(el)
      return { font: style.fontFamily, border: style.borderTopStyle, color: style.color, sizing: style.boxSizing }
    })
    expect(input.font).not.toContain('Comic Sans')
    expect(input.border).not.toBe('dashed')
    expect(input.color).not.toBe('rgb(255, 0, 0)')
    expect(input.sizing).toBe('border-box')

    const site = await createPage(url('/'))
    await site.getByText('A public page').waitFor()
    const leaked = await site.evaluate(() => ({
      host: !!document.querySelector('atelier-admin'),
      rules: [...document.styleSheets, ...document.adoptedStyleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(rule => rule.cssText.includes('cn-') || rule.cssText.includes('data-atelier-admin'))
        }
        catch {
          return false
        }
      }),
    }))
    expect(leaked).toEqual({ host: false, rules: false })
  })

  it('has no passkey option, and loads no passkey code, with passkeys off', async () => {
    const page = await createPage()
    const scripts: Promise<string>[] = []
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script')
        scripts.push(response.text())
    })
    await page.goto(url('/admin'))
    await page.getByLabel('Email').waitFor()
    expect(await page.getByRole('button', { name: /passkey/i }).count()).toBe(0)
    expect((await Promise.all(scripts)).some(code => code.includes('startAuthentication'))).toBe(false)
  })
})
