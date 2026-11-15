// The whole journey, end to end, on a built app (test/fixtures/journey): the developer has installed Nuxt
// Atelier and defined the schema and blocks; the first administrator signs up, builds a page in the visual
// editor, publishes it, translates it and schedules the translation; visitors then get server-rendered pages
// with their metadata, the sitemap lists both, and site search finds them.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/journey', import.meta.url))
const JOBS_SECRET = 'a-jobs-secret-for-the-journey'

/** `date` as a datetime-local input takes it: the user's local time, to the minute. */
const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

describe('the journey', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true, server: false })

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-journey-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
      NUXT_ATELIER_JOBS_SECRET: JOBS_SECRET,
    } })
  })

  it('goes from a fresh install to published, translated, scheduled pages that visitors and search engines get', async () => {
    // the developer's schema and blocks are what the admin offers
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Create administrator' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

    // a new page, saved as a draft
    await page.getByRole('link', { name: 'Pages' }).first().click()
    await page.getByRole('link', { name: 'New' }).click()
    await page.getByLabel('Title *').fill('Spring sale')
    await expect.poll(() => page.getByLabel('Slug *').inputValue()).toBe('spring-sale')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL(/\/admin\/collections\/pages\/(?!new)[^/?]+/)
    const english = new URL(page.url()).pathname.split('/').pop()!

    // built in the visual editor
    await page.locator('[data-visual-editor]').first().click()
    const preview = page.frameLocator('iframe[title="Preview of the page"]')
    await preview.locator('body').waitFor({ state: 'attached' })
    await page.locator('[data-palette-block="Hero"]').click()
    await page.getByLabel('Heading').fill('Everything half price')
    await preview.getByText('Everything half price').waitFor()
    await page.locator('[data-palette-block="Paragraph"]').click()
    await page.getByLabel('Body').fill('Until the end of the month.')
    await preview.getByText('Until the end of the month.').waitFor()
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Saved', { exact: true }).first().waitFor()

    // published now
    await page.goto(url(`/admin/collections/pages/${english}`))
    await page.getByRole('button', { name: 'Publish' }).click()
    await page.getByText('Published', { exact: true }).first().waitFor()

    // translated into German, and scheduled
    await page.getByRole('button', { name: 'Add DE' }).click()
    await page.waitForURL(url => !url.pathname.endsWith(english))
    await page.getByLabel('Title *').fill('Frühjahrsverkauf')
    await expect.poll(() => page.getByLabel('Slug *').inputValue()).toBe('fruhjahrsverkauf') // made from the title
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Draft saved').waitFor()
    const at = new Date(Math.ceil((Date.now() + 20_000) / 60_000) * 60_000) // the next minute at least 20 s away
    const schedule = page.locator('[data-schedule]')
    await schedule.getByLabel('Date and time').fill(local(at))
    await schedule.getByRole('button', { name: 'Schedule' }).click()
    await schedule.locator('[data-scheduled="publish"]').waitFor()

    // the German page isn't out before its time; the scheduler publishes it then
    expect((await fetch('/de/fruhjahrsverkauf')).status).toBe(404)
    await expect.poll(async () => {
      await fetch('/api/_atelier/jobs/run', { method: 'POST', headers: { authorization: `Bearer ${JOBS_SECRET}` } })
      return (await fetch('/de/fruhjahrsverkauf')).status
    }, { timeout: 120_000, interval: 5_000 }).toBe(200)

    // what visitors get: rendered on the server, with metadata and the translation linked
    const html = await $fetch<string>('/spring-sale')
    expect(html).toContain('<title>Spring sale | Journey</title>')
    expect(html).toContain('Everything half price')
    expect(html).toContain('Until the end of the month.')
    expect(html).toMatch(/<link[^>]+rel="alternate"[^>]+hreflang="de"[^>]+href="[^"]*\/de\/fruhjahrsverkauf"/)
    expect(await $fetch<string>('/de/fruhjahrsverkauf')).toContain('<title>Frühjahrsverkauf | Journey</title>')

    // what search engines get, and what site search finds
    const sitemap = await $fetch<string>('/sitemap.xml')
    expect(sitemap).toMatch(/<loc>[^<]*\/spring-sale<\/loc>/)
    expect(sitemap).toContain('/de/fruhjahrsverkauf')
    const found = await $fetch<{ items: { title: string, path: string }[] }>('/api/_atelier/search', { query: { q: 'half price', locale: 'en' } })
    expect(found.items.map(i => i.title)).toEqual(['Spring sale'])
    const german = await $fetch<{ items: { title: string }[] }>('/api/_atelier/search', { query: { q: 'frühjahr', locale: 'de' } })
    expect(german.items.map(i => i.title)).toEqual(['Frühjahrsverkauf'])
  }, 300_000)
})
