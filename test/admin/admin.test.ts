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

  async function signIn() {
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    return page
  }

  it('renders a custom field type\'s own input, and saves its value', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').fill('Somewhere')
    await page.locator('[data-geo-point]').getByLabel('Latitude').fill('-6.8')
    await page.locator('[data-geo-point]').getByLabel('Longitude').fill('39.28')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)
    const id = page.url().split('/').pop()!
    const saved = await page.evaluate(async (id) => {
      const response = await window.fetch(`/api/_atelier/collections/posts/${id}?draft=true`)
      return (await response.json()).data.location
    }, id)
    expect(saved).toEqual({ lat: -6.8, lng: 39.28 })
  })

  it('creates a role and gives it to a new user', async () => {
    const page = await signIn()
    await page.getByRole('link', { name: 'Roles' }).first().click()
    await page.getByRole('link', { name: 'New role' }).click()
    await page.getByLabel('Name').fill('reviewer')
    await page.getByLabel('Label').fill('Reviewer')
    await page.getByLabel('Read Posts', { exact: true }).check()
    await page.getByLabel('Update Posts', { exact: true }).check()
    await page.getByRole('button', { name: 'Save role' }).click()
    await page.waitForURL(/\/admin\/roles\/reviewer$/)

    await page.getByRole('link', { name: 'Users' }).first().click()
    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill('rita@example.com')
    await dialog.getByLabel('Role').selectOption('reviewer')
    await dialog.getByLabel('Password').fill('password 456')
    await dialog.getByRole('button', { name: 'Create user' }).click()
    await page.getByRole('row').filter({ hasText: 'rita@example.com' }).getByText('Reviewer').waitFor()

    // Rita sees posts, and can't create them
    const rita = await createPage(url('/admin'))
    await rita.getByLabel('Email').fill('rita@example.com')
    await rita.getByLabel('Password').fill('password 456')
    await rita.getByRole('button', { name: 'Sign in' }).click()
    await rita.getByRole('link', { name: 'Posts' }).first().click()
    await rita.getByRole('heading', { name: 'Posts' }).waitFor()
    expect(await rita.getByRole('link', { name: 'New' }).count()).toBe(0)
    expect(await rita.getByRole('link', { name: 'Authors' }).count()).toBe(0)
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
