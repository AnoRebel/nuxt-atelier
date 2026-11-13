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

  it('shows the app\'s branding, theme tokens, field input override and own page, the page only to those allowed', async () => {
    const page = await signIn()
    await page.getByText('Fixture CMS').first().waitFor()
    const root = () => page.evaluate(() => {
      const el = document.querySelector('atelier-admin')!.shadowRoot!.querySelector<HTMLElement>('[data-atelier-admin]')!
      return { accent: el.style.getPropertyValue('--accent-primary-base'), material: el.dataset.material }
    })
    expect((await root()).accent).toBe('#c2410c')

    await page.getByRole('link', { name: 'Site tools' }).first().click()
    await page.locator('[data-site-tools]').waitFor()
    expect(await page.evaluate(() => [!!document.querySelector('[data-portal-content]'), !!document.querySelector('atelier-admin')!.shadowRoot!.querySelector('[data-atelier-admin] [data-portal-content]')]))
      .toEqual([false, true]) // in the admin's shadow root, not on the page
    await page.goto(url('/admin/collections/posts/new'))
    await page.locator('[data-app-date]').waitFor() // the app's date input, not the admin's

    // the appearance a viewer picks is kept
    await page.getByRole('button', { name: 'Appearance' }).click()
    await page.getByRole('radio', { name: /Folio/ }).check({ force: true })
    await page.getByRole('button', { name: 'Done' }).click()
    await page.reload()
    await page.getByLabel('Title *').waitFor()
    expect((await root()).material).toBe('folio')

    // Rita (a reviewer) doesn't manage settings: no link, and the page is refused
    const rita = await createPage(url('/admin'))
    await rita.getByLabel('Email').fill('rita@example.com')
    await rita.getByLabel('Password').fill('password 456')
    await rita.getByRole('button', { name: 'Sign in' }).click()
    await rita.getByRole('heading', { name: 'Dashboard' }).waitFor()
    expect(await rita.getByRole('link', { name: 'Site tools' }).count()).toBe(0)
    await rita.goto(url('/admin/tools'))
    await rita.getByRole('heading', { name: 'You can\'t open this' }).waitFor()
    expect(await rita.locator('[data-site-tools]').count()).toBe(0)
  })

  it('offers unsaved changes back after a crash, and asks before leaving them', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts'))
    await page.getByRole('link', { name: 'Hello world' }).click()
    await page.getByLabel('Summary').fill('Written before the crash')
    await page.waitForTimeout(800) // the copy is written shortly after typing stops
    await page.reload() // the tab dies: nothing saved
    await page.locator('[data-recovery]').waitFor()
    expect(await page.getByLabel('Summary').inputValue()).toBe('')
    await page.getByRole('button', { name: 'Restore them' }).click()
    expect(await page.getByLabel('Summary').inputValue()).toBe('Written before the crash')

    // leaving with unsaved changes asks first
    await page.getByRole('link', { name: 'Dashboard' }).first().click()
    const ask = page.getByRole('alertdialog', { name: 'Leave without saving?' })
    await ask.waitFor()
    await ask.getByRole('button', { name: 'Stay' }).click()
    expect(page.url()).toMatch(/\/admin\/collections\/posts\/[^/]+$/)
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Draft saved').waitFor()
    await page.reload()
    await page.getByLabel('Summary').waitFor()
    expect(await page.locator('[data-recovery]').count()).toBe(0) // saved: no copy left
  })

  it('creates a related entry from a relation field, keeping the form\'s unsaved changes', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').fill('With an author')
    await page.getByRole('button', { name: 'New author' }).click()
    const dialog = page.getByRole('dialog', { name: 'New author' })
    await dialog.getByLabel('Name *').fill('Grace')
    await dialog.getByRole('button', { name: 'Create author' }).click()
    await dialog.waitFor({ state: 'hidden' })
    expect(await page.getByLabel('Title *').inputValue()).toBe('With an author') // kept
    const author = page.getByLabel('Author', { exact: true })
    await expect.poll(async () => author.locator('option:checked').textContent()).toBe('Grace')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)
  })

  it('shows failed jobs on the dashboard, with a retry, and the user\'s drafts', async () => {
    await fetch('/api/test/explode', { method: 'POST' })
    const page = await signIn()
    const widget = page.locator('[data-widget="failed-jobs"]')
    await widget.getByText('the webhook endpoint said no').waitFor()
    await widget.getByRole('button', { name: 'Retry test:explode' }).click()
    await page.getByText('Queued again').waitFor()
    await widget.waitFor({ state: 'detached' }) // queued again: no longer failed
    await page.locator('[data-widget="drafts"]').getByRole('link', { name: 'Hello world' }).waitFor()
  })

  it('switches the admin\'s language, apart from the content, English where a translation lacks text', async () => {
    const page = await signIn()
    await page.getByRole('button', { name: 'Appearance' }).click()
    await page.getByLabel('Language').selectOption('de')
    await page.getByRole('button', { name: 'Fertig' }).click()
    await page.getByRole('heading', { name: 'Übersicht' }).waitFor()
    await page.getByText('Angemeldet als ada@example.com.').waitFor()
    await page.getByRole('link', { name: 'Posts' }).first().click() // content labels stay as defined
    await page.getByRole('link', { name: 'Neu' }).waitFor()
    await page.getByRole('button', { name: 'Columns' }).waitFor() // not in the German catalog: English
    await page.reload()
    await page.getByRole('link', { name: 'Neu' }).waitFor() // remembered
    await page.evaluate(() => localStorage.removeItem('atelier-admin-language'))
  })

  it('lists a localized collection per locale, and adds and links an entry\'s translations', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/pages'))
    await page.getByRole('link', { name: 'New' }).click()
    await page.waitForURL(/\/new\?locale=en$/)
    await page.getByLabel('Title *').fill('About us')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/pages\/[^/?]+$/)
    await page.getByText('In EN').waitFor()

    await page.getByRole('button', { name: 'Add DE' }).click()
    await page.getByText('In DE').waitFor()
    expect(await page.getByLabel('Title *').inputValue()).toBe('About us') // prefilled from English
    await page.getByLabel('Title *').fill('Über uns')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Draft saved').waitFor()
    await page.getByRole('link', { name: 'EN', exact: true }).click()
    await page.getByText('In EN').waitFor()
    expect(await page.getByLabel('Title *').inputValue()).toBe('About us')

    await page.goto(url('/admin/collections/pages'))
    await page.getByLabel('Locale').selectOption('de')
    await page.getByRole('link', { name: 'Über uns' }).waitFor()
    expect(await page.getByRole('link', { name: 'About us' }).count()).toBe(0)
  })

  it('edits the robots.txt rules, which override the configuration until reset', async () => {
    const page = await signIn()
    await page.getByRole('link', { name: 'Search engines' }).first().click()
    await page.locator('[data-robots-source]').getByText('From the site\'s configuration.').waitFor()
    await page.getByRole('button', { name: 'Add a rule' }).click()
    await page.getByLabel('Crawlers').fill('GPTBot')
    await page.getByLabel('Keep out of').fill('/')
    expect(await page.locator('[data-robots-preview]').textContent()).toContain('User-agent: GPTBot\nDisallow: /admin\nDisallow: /api/_atelier/\nDisallow: /')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Search engine rules saved').waitFor()
    expect(await (await fetch('/robots.txt')).text()).toContain('User-agent: GPTBot')
    await page.getByRole('button', { name: 'Use the configuration' }).click()
    await page.locator('[data-robots-source]').getByText('From the site\'s configuration.').waitFor()
    expect(await (await fetch('/robots.txt')).text()).not.toContain('GPTBot')
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
