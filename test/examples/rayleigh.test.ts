// The Rayleigh example (examples/rayleigh) builds, seeds itself, and renders its pages with no hydration
// warnings: the home page's galleries (opening full screen), the blog with its pages, a post, dark mode,
// and the contact form.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

describe('the Rayleigh example', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../../examples/rayleigh', import.meta.url)), browser: true })

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rayleigh-'))
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(dir, 'db.sqlite')}`,
      NUXT_ATELIER_STORAGE_DIR: join(dir, 'uploads'),
      NUXT_ATELIER_MIGRATIONS_AUTO_APPLY: 'true',
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
  })

  it('seeds itself and serves every page, a missing page of posts as a 404', async () => {
    const home = await $fetch<string>('/')
    expect(home).toContain('Welcome to Rayleigh')
    expect(home).toContain('Interior design')
    expect(await $fetch<string>('/about')).toContain('Welcome to my world of transforming spaces with art!')
    const blog = await $fetch<string>('/blog')
    expect(blog).toContain('Harmony in Space: The Essence of Minimalist Design')
    expect(blog).not.toContain('City Meets Countryside') // the fourth post is on page 2
    expect(await $fetch<string>('/blog?page=2')).toContain('City Meets Countryside')
    expect((await fetch('/blog?page=9')).status).toBe(404)
    const post = await $fetch<string>('/blog/harmony-in-space')
    expect(post).toContain('The Concept of Minimalism')
    expect(post).toContain('Written on February 21, 2024')
  })

  it('has a contact form that takes a message', async () => {
    const page = await createPage(url('/contact'))
    const form = page.getByRole('form', { name: 'Contact' })
    await form.getByLabel('Your name').fill('Ada')
    await form.getByLabel('Email').fill('ada@example.com')
    await form.getByLabel('Message').fill('I would like a new reading room.')
    await page.waitForTimeout(3_200) // the form's minimum fill time: quicker is taken for a bot
    await form.getByRole('button', { name: 'Send' }).click()
    await page.getByText('Thank you! I’ll get back to you soon.').waitFor()
  })

  it('hydrates without warnings, opens a gallery image full screen, and switches to dark mode', async () => {
    const page = await createPage()
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        warnings.push(message.text())
    })
    for (const path of ['/blog', '/blog/harmony-in-space', '/about', '/'])
      await page.goto(url(path), { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: 'Open Modern armchair' }).click()
    const dialog = page.getByRole('dialog', { name: 'Interior design' })
    await dialog.getByText('Modern armchair').waitFor()
    await page.keyboard.press('ArrowRight')
    await dialog.getByText('Contemporary coffee table').waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })

    await page.getByTitle('Switch to dark mode').click()
    await expect.poll(() => page.evaluate(() => document.documentElement.className)).toContain('dark')
    await page.reload({ waitUntil: 'networkidle' }) // the server renders the choice
    expect(await page.evaluate(() => document.documentElement.className)).toContain('dark')
    expect(warnings).toEqual([])
  })
})
