// The admin over a site with hostile global CSS (test/fixtures/admin): first-run setup, creating and listing
// an entry, style isolation both ways, and no passkey code when passkeys are off.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
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

  it('sends a strict content security policy that its own scripts satisfy', async () => {
    const response = await fetch('/admin')
    const policy = response.headers.get('content-security-policy') ?? ''
    const html = await response.text()
    const scriptSrc = policy.split('; ').find(d => d.startsWith('script-src '))!
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
    expect(policy).toContain('frame-ancestors \'self\'')
    expect(policy).toContain('object-src \'none\'')
    // every inline script the page runs is allowed by hash, and nothing else
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attributes]) => !/\ssrc=|application\/json/.test(attributes!)).map(([, , content]) => `'sha256-${createHash('sha256').update(content!).digest('base64')}'`)
    expect(inline.length).toBeGreaterThan(0)
    expect(scriptSrc.split(' ').filter(s => s.startsWith('\'sha256-')).toSorted()).toEqual([...new Set(inline)].toSorted())

    // and the admin works under it: no violation while signing in and opening an entry list
    const page = await createPage()
    const violations: string[] = []
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text()))
        violations.push(message.text())
    })
    await page.goto(url('/admin'))
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    await page.goto(url('/admin/collections/posts'))
    await page.getByRole('link', { name: 'Hello world' }).waitFor()
    expect(violations).toEqual([])
  })

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

    // without publish: she saves drafts, and has no Publish, in the admin or the API
    await rita.getByRole('link', { name: 'Hello world' }).click()
    await rita.getByLabel('Title *').fill('Hello world, reviewed')
    await rita.getByRole('button', { name: 'Save draft' }).click()
    await rita.getByText('Draft saved').waitFor()
    expect(await rita.getByRole('button', { name: 'Publish' }).count()).toBe(0)
    const status = await rita.evaluate(async (path) => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const entry = await (await window.fetch(`/api/_atelier/collections/posts/${path}?draft=true`)).json()
      const refused = (await window.fetch(`/api/_atelier/collections/posts/${path}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ version: entry.version }) })).status
      // done: she gives up her edit lock, which the next tests' edits would wait on
      await window.fetch(`/api/_atelier/collab/posts/${path}`, { method: 'DELETE', headers: { 'x-atelier-csrf': csrf } })
      return refused
    }, new URL(rita.url()).pathname.split('/').pop()!)
    expect(status).toBe(403)
    await rita.close()
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

  it('lists an entry\'s history with author, time and publication, compares two versions and restores one', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').fill('A history')
    await page.getByLabel('Category').selectOption('news')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)
    await page.getByRole('button', { name: 'Publish' }).click()
    await page.getByText('Published', { exact: true }).first().waitFor()
    await page.getByLabel('Title *').fill('A history, rewritten')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Draft saved').waitFor()

    const history = page.locator('[data-history]')
    await history.getByText('History', { exact: true }).click()
    const rows = history.locator('[data-revision]')
    await expect.poll(() => rows.evaluateAll(els => els.map(el => el.getAttribute('data-revision')))).toEqual(['3', '2', '1']) // newest first
    expect(await rows.first().textContent()).toMatch(/by ada@example\.com/)
    expect(await history.locator('[data-revision="2"]').getByText('Published').count()).toBe(1)
    expect(await history.locator('[data-revision="3"]').getByText('Published').count()).toBe(0)

    await history.getByLabel('Version 1').check()
    await history.getByLabel('Version 3').check()
    await history.locator('[data-changes]').getByText('title: A history → A history, rewritten').waitFor()

    await history.locator('[data-revision="1"]').getByRole('button', { name: 'Restore' }).click()
    await page.getByText('Version 1 restored as a new draft').waitFor()
    await expect.poll(() => page.getByLabel('Title *').inputValue()).toBe('A history')
    await expect.poll(() => rows.count()).toBe(4) // the versions in between stay
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

  it('edits a localized singleton per locale, a shared field kept the same in all', async () => {
    const page = await signIn()
    // each save, waited for by its own response: a toast from the one before may still be showing
    const save = () => Promise.all([page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/singletons/banner')), page.getByRole('button', { name: 'Save' }).click()])
    await page.goto(url('/admin/singletons/banner'))
    await page.getByText('In EN').waitFor()
    await page.getByLabel('Message').fill('Summer sale')
    await page.getByLabel('Link').fill('/sale')
    await save()

    await page.getByRole('link', { name: 'DE', exact: true }).click()
    await page.getByText('In DE').waitFor()
    expect(await page.getByLabel('Message').inputValue()).toBe('') // its own, not English's
    await page.getByLabel('Message').fill('Sommerschlussverkauf')
    await page.getByLabel('Link').fill('/angebote')
    await save()

    const read = (locale: string) => page.evaluate(async l => (await (await window.fetch(`/api/_atelier/singletons/banner?locale=${l}`)).json()) as { locale: string, data: Record<string, string>, fallbacks?: Record<string, string> }, locale)
    expect(await read('de')).toMatchObject({ locale: 'de', data: { message: 'Sommerschlussverkauf', link: '/angebote' } })
    expect(await read('en')).toMatchObject({ locale: 'en', data: { message: 'Summer sale', link: '/angebote' } }) // the shared link follows
    // emptied in German: the site shows the English message, and says so
    await page.getByLabel('Message').fill('')
    await save()
    expect(await read('de')).toMatchObject({ locale: 'de', data: { message: 'Summer sale' }, fallbacks: { message: 'en' } })
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

  it('previews a routable entry in search results and shares, with advice that never blocks saving', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/articles/new'))
    await page.getByLabel('Title *').fill('Hello world')
    await page.getByLabel('Slug *').fill('hello')
    const panel = page.locator('[data-seo-panel]')
    await panel.getByText('Hello world').first().waitFor()
    await panel.getByText('Add a description').waitFor() // missing description: a warning
    await page.getByRole('button', { name: 'Save', exact: true }).click() // and it saves anyway
    await page.waitForURL(/\/admin\/collections\/articles\/(?!new)[^/]+$/)
    await panel.getByText('/articles/hello').waitFor()

    await page.getByLabel('Excerpt').fill('A short look at what the site is, who writes it, and how often it changes.')
    await page.locator('[data-seo-checks]').waitFor({ state: 'detached' })
    await panel.getByText('Nothing to improve.').waitFor()

    // another article with the same title is flagged
    await page.goto(url('/admin/collections/articles/new'))
    await page.getByLabel('Title *').fill('Hello world')
    await panel.getByText('Another entry has the same title').waitFor()
  })

  it('finds entries, users and admin pages from the global search, only what the user may see', async () => {
    const page = await signIn()
    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: 'Search' })
    await dialog.getByRole('combobox').fill('hello')
    await dialog.getByRole('option').filter({ hasText: 'Hello world' }).first().waitFor()
    await dialog.getByRole('combobox').fill('rita')
    await dialog.getByRole('option').filter({ hasText: 'rita@example.com' }).waitFor()
    await dialog.getByRole('combobox').fill('search eng')
    await dialog.getByRole('option').filter({ hasText: 'Search engines' }).waitFor()
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: 'Search engines' }).waitFor()

    // Rita (a reviewer: posts only) finds posts, not authors or users
    const rita = await createPage(url('/admin'))
    await rita.getByLabel('Email').fill('rita@example.com')
    await rita.getByLabel('Password').fill('password 456')
    await rita.getByRole('button', { name: 'Sign in' }).click()
    await rita.getByRole('heading', { name: 'Dashboard' }).waitFor()
    const found = await rita.evaluate(async () => (await (await window.fetch('/api/_atelier/search/admin?q=a')).json()).results as { kind: string, type?: string }[])
    expect(found.some(r => r.type === 'posts')).toBe(true)
    expect(found.some(r => r.type === 'authors' || r.kind === 'user')).toBe(false)
  })

  it('uploads, describes and picks media, and warns before deleting a file in use', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    const page = await signIn()
    await page.getByRole('link', { name: 'Media' }).first().click()
    await page.locator('[data-media-upload]').setInputFiles({ name: 'garden.png', mimeType: 'image/png', buffer: png })
    await page.getByText('1 uploaded').waitFor()
    await page.getByRole('button', { name: /garden\.png/ }).click()
    const details = page.locator('[data-media-details]')
    await details.getByLabel('Alt text (EN)').fill('A garden in spring')
    await details.getByRole('button', { name: /Click the part of the image/ }).click({ position: { x: 10, y: 10 } })
    await details.getByRole('button', { name: 'Save' }).click()
    await page.getByText('File saved').waitFor()
    const saved = await page.evaluate(async () => (await (await window.fetch('/api/_atelier/media?limit=1')).json()).items[0])
    expect(saved).toMatchObject({ filename: 'garden.png', alt: { en: 'A garden in spring' }, focal: { x: expect.any(Number), y: expect.any(Number) } })
    await page.keyboard.press('Escape')

    // chosen in a media field (the SEO image of an article), through the picker
    await page.goto(url('/admin/collections/articles/new'))
    await page.getByLabel('Title *').fill('With a picture')
    await page.getByLabel('Slug *').fill('with-a-picture')
    await page.locator('[data-media-field]').getByRole('button', { name: 'Choose' }).click()
    await page.getByRole('dialog', { name: 'Choose a file' }).getByRole('button', { name: 'Select garden.png' }).click()
    await page.locator('[data-media-field]').getByText('garden.png').waitFor()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForURL(/\/admin\/collections\/articles\/(?!new)[^/]+$/)

    // in use: deleting says so first
    await page.goto(url('/admin/media'))
    await page.getByRole('button', { name: /garden\.png/ }).click()
    await page.locator('[data-media-details]').getByText('Used in 1 place').waitFor()
    await page.locator('[data-media-details]').getByRole('button', { name: 'Delete' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete this file?' })
    await confirm.getByText(/used in 1 place,/).waitFor()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await page.getByText('File deleted').waitFor()
  })

  it('edits rich text with the editor, storing ProseMirror JSON', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').fill('Rich')
    const editor = page.locator('[data-rich-text]').getByRole('textbox')
    await editor.click()
    await page.keyboard.type('Hello ')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('world')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Bulleted list' }).click()
    await page.keyboard.type('first item')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)
    const id = page.url().split('/').pop()!
    const body = await page.evaluate(async id => (await (await window.fetch(`/api/_atelier/collections/posts/${id}?draft=true`)).json()).data.body, id)
    const [first, list] = body.content
    expect(first.content.map((n: { text: string }) => n.text).join('')).toBe('Hello world')
    expect(first.content.find((n: { text: string }) => n.text.includes('world')).marks).toEqual([{ type: 'bold' }])
    expect(list).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first item' }] }] }] })
    // reopened, the editor shows it
    await page.reload()
    await page.locator('[data-rich-text]').getByText('first item').waitFor()
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

  it('has no AI actions, endpoints or code without @nuxt-atelier/ai', async () => {
    expect((await fetch('/api/_atelier/ai')).status).toBe(404)
    const page = await createPage()
    const scripts: Promise<string>[] = []
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script')
        scripts.push(response.text())
    })
    await page.goto(url('/admin'))
    await page.getByLabel('Email').waitFor()
    expect((await Promise.all(scripts)).some(code => code.includes('/ai/suggest') || code.includes('data-ai-'))).toBe(false)
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
  async function signInAs(email: string, password: string, before?: (page: Awaited<ReturnType<typeof createPage>>) => Promise<void>) {
    const page = await createPage()
    await before?.(page)
    await page.goto(url('/admin'))
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    return page
  }

  it('locks an entry for its editor, shows who else is there, and pushes a takeover within 2 seconds', async () => {
    const ada = await signIn()
    await ada.goto(url('/admin/collections/posts/new'))
    await ada.getByLabel('Title *').fill('Shared draft')
    await ada.getByRole('button', { name: 'Save draft' }).click()
    await ada.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)
    const entry = ada.url()
    await ada.goto(url('/admin'))

    // Rita opens it first: hers to edit
    const rita = await signInAs('rita@example.com', 'password 456')
    await rita.goto(entry)
    await rita.getByLabel('Title *').fill('Rita was here')
    // Ada opens it: read-only, with Rita's lock and presence shown; Rita sees Ada
    await ada.goto(entry)
    await ada.locator('[data-locked]').getByText('rita@example.com is editing').waitFor()
    expect(await ada.getByLabel('Title *').isDisabled()).toBe(true)
    expect(await ada.getByRole('button', { name: 'Save draft' }).count()).toBe(0)
    await ada.locator('[data-presence]').getByText('rita@example.com', { exact: false }).waitFor({ state: 'attached' })
    await rita.locator('[data-presence]').getByText('ada@example.com', { exact: false }).waitFor({ state: 'attached', timeout: 2_000 })

    // Ada takes over: Rita hears at once (pushed), and her unsaved title is kept for later
    await ada.getByRole('button', { name: 'Take over' }).click()
    await rita.locator('[data-taken-over]').getByText('ada@example.com took over').waitFor({ timeout: 2_000 })
    expect(await rita.getByLabel('Title *').isDisabled()).toBe(true)
    expect(await rita.getByLabel('Title *').inputValue()).toBe('Shared draft')
    await rita.locator('[data-recovery]').waitFor()
    expect(await ada.getByLabel('Title *').isDisabled()).toBe(false)
    // and is told so in her notifications
    await rita.locator('[data-notifications]').getByText('1 unread', { exact: false }).waitFor({ state: 'attached', timeout: 2_000 })
  })

  it('notifies a mentioned user of a comment, which takes them to it', async () => {
    const ada = await signIn()
    await ada.goto(url('/admin/collections/posts'))
    await ada.getByRole('link', { name: 'Shared draft' }).click()
    await ada.waitForURL(/\/admin\/collections\/posts\/[^/]+$/)
    const comments = ada.locator('[data-comments]')
    await comments.getByLabel('Add a comment').fill('Please check the intro')
    await comments.locator('[data-new-comment]').getByLabel('Mention').selectOption({ label: 'rita@example.com' })
    expect(await comments.getByLabel('Add a comment').inputValue()).toBe('Please check the intro @rita@example.com ')
    await comments.getByRole('button', { name: 'Comment' }).click()
    await comments.getByText('Please check the intro @rita@example.com').waitFor()

    const rita = await signInAs('rita@example.com', 'password 456')
    await rita.locator('[data-notifications]').click()
    await rita.getByRole('menuitem', { name: /ada@example\.com mentioned you in Posts/ }).click()
    await rita.waitForURL(ada.url())
    await rita.locator('[data-comments]').getByText('Please check the intro').waitFor()
    expect(await rita.locator('[data-new-comment]').count()).toBe(0) // reviewers may read, not comment
  })

  it('falls back to polling when the real-time connection is unavailable', async () => {
    const ada = await signIn()
    await ada.goto(url('/admin/collections/posts'))
    await ada.getByRole('link', { name: 'Shared draft' }).click()
    await ada.waitForURL(/\/admin\/collections\/posts\/[^/]+$/)
    const entry = ada.url()
    await ada.getByLabel('Title *').waitFor()
    expect(await ada.getByLabel('Title *').isDisabled()).toBe(false) // Ada still holds the lock

    // Rita without WebSocket: she still sees the lock, and gets the entry once Ada leaves
    const rita = await signInAs('rita@example.com', 'password 456', page => page.routeWebSocket(/\/api\/_atelier\/ws/, ws => ws.close()))
    await rita.goto(entry)
    await rita.locator('[data-locked]').waitFor()
    await ada.goto(url('/admin'))
    await rita.locator('[data-locked]').waitFor({ state: 'detached', timeout: 25_000 })
    await expect.poll(() => rita.getByLabel('Title *').isDisabled(), { timeout: 5_000 }).toBe(false)
  }, 60_000)
  it('starts a new entry from a template, and saves an entry as one', async () => {
    const page = await signIn()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Start from').selectOption({ label: 'Announcement' })
    expect(await page.getByLabel('Title *').inputValue()).toBe('We have news')
    expect(await page.getByLabel('Category').inputValue()).toBe('news')
    await page.getByLabel('Title *').fill('Big news')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/(?!new)[^/]+$/)

    await page.getByRole('button', { name: 'Save as template' }).click()
    await page.getByRole('alertdialog').getByLabel('Template name').fill('Like big news')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save as template' }).click()
    await page.getByText('Template saved').waitFor()
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Start from').selectOption({ label: 'Like big news' })
    expect(await page.getByLabel('Title *').inputValue()).toBe('Big news')
  })
})
