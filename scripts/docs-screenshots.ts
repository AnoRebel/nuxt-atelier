// The docs' screenshots (docs/public/media/*.webp), taken from the Rayleigh example with its demo content.
// Against a fresh database, so the first screen is the setup:
//
//   cd examples/rayleigh && bun run build
//   NUXT_ATELIER_DATABASE_URL=file:/tmp/shots.sqlite bunx atelier migrate apply
//   NUXT_ATELIER_DATABASE_URL=file:/tmp/shots.sqlite NUXT_APP_SECRET=<32+ characters> node .output/server/index.mjs
//   bun run docs:screenshots                   # BASE=http://localhost:3000 by default
//
// It edits the content as it goes (a draft, a user, a comment, a submission): run it on a fresh database.
// Names after the command take only those shots (`bun scripts/docs-screenshots.ts admin-list`).
import type { Locator, Page } from 'playwright-core'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import sharp from 'sharp'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = resolve(import.meta.dirname, '../docs/public/media')
const ONLY = process.argv.slice(2)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
const page = await context.newPage()

/** Saves the page, or one element of it with a margin of the page around it, as a WebP. */
async function shot(name: string, target: Page | Locator = page) {
  if (ONLY.length && !ONLY.includes(name))
    return
  await page.mouse.move(0, 0) // no hover effects
  await page.waitForTimeout(400)
  let clip: { x: number, y: number, width: number, height: number } | undefined
  if (target !== page) {
    await (target as Locator).scrollIntoViewIfNeeded()
    const box = (await (target as Locator).boundingBox())!
    const x = Math.max(0, box.x - 24)
    const y = Math.max(0, box.y - 24)
    clip = { x, y, width: Math.min(1440 - x, box.width + 48), height: Math.min(900 - y, box.height + 48) }
  }
  const png = await page.screenshot({ animations: 'disabled', clip })
  await sharp(png).webp({ quality: 82 }).toFile(join(OUT, `${name}.webp`))
  console.log(name)
}
const admin = (path = '') => page.goto(`${BASE}/admin${path}`)
const heading = (name: string | RegExp) => page.getByRole('heading', { name }).first().waitFor()
// the editor keeps a connection open (presence): idle or not after 5 s
const settle = () => page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}).then(() => page.waitForTimeout(600))
/** The section of the entry form under `name`. */
const section = (name: string) => page.locator('section, fieldset').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()

// --- setup, then the admin
await admin()
const setup = page.getByRole('button', { name: 'Create administrator' })
await setup.or(page.getByRole('button', { name: 'Sign in', exact: true })).waitFor()
if (await setup.isVisible()) {
  await shot('admin-setup')
  await page.getByLabel('Name').fill('Ada Lovelace')
}
await page.getByLabel('Email').fill('ada@example.com')
await page.getByLabel('Password').fill('a long docs password')
await page.getByRole('button', { name: /^(Create administrator|Sign in)$/ }).click()
await heading('Dashboard')

await admin('/collections/posts')
await page.getByRole('link', { name: /Linear Elegance/ }).click()
await page.getByLabel('Title *').waitFor()
const post = page.url()
// a draft over the published post, so it shows as changed, with history
await page.getByLabel('Headline').fill('Linear Elegance: Architectural Minimalism')
await page.getByRole('button', { name: 'Save draft' }).click()
await page.getByText('Draft saved').waitFor()

await admin()
await heading('Dashboard')
await settle()
await shot('admin-dashboard')

await admin('/collections/posts')
await heading('Posts')
await settle()
await shot('admin-list')

await page.goto(post)
await page.getByLabel('Title *').waitFor()
await settle()
await shot('admin-entry')
await shot('admin-seo', section('Search and sharing'))
await shot('admin-schedule', section('Schedule'))
await page.locator('[data-history] summary').click()
await settle()
await shot('admin-history', page.locator('[data-history]'))

await admin('/users')
await heading('Users')
await page.getByRole('button', { name: 'New user' }).click()
await page.getByLabel('Email').fill('grace@example.com')
await page.getByLabel('Name').fill('Grace Hopper')
await page.getByLabel('Role').selectOption({ label: 'Editor' }).catch(() => {})
await page.getByLabel('Password').fill('another long password')
await page.getByRole('button', { name: 'Create user' }).click()
await page.getByText('Grace Hopper').first().waitFor()
await page.getByText('User created').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
await settle()
await shot('admin-users')

await admin('/roles/new')
await heading('New role')
await page.getByLabel('Name').fill('author')
await page.getByLabel('Label').fill('Author')
await page.getByLabel('Media').check()
await settle()
await shot('admin-role')

await admin('/media')
await heading('Media')
await settle()
await shot('media-library')
await page.getByRole('button', { name: 'harmony-seating.webp' }).click()
await settle()
await shot('media-details')

await admin('/settings/robots')
await heading('Search engines')
await settle()
await shot('seo-robots')

// a submission, then the form in the admin
await page.goto(`${BASE}/contact`)
await page.getByLabel(/Your name/).fill('Grace Hopper')
await page.getByLabel(/email/i).first().fill('grace@example.com')
await page.getByLabel(/message/i).fill('Could you design a reading room for our library?')
await shot('tutorial-contact')
await page.getByRole('button', { name: /send/i }).click()
await page.getByRole('status').waitFor()
await admin('/collections/atelier-forms')
await page.getByRole('link', { name: 'Contact' }).click()
await page.getByLabel('Title *').waitFor()
await settle()
await shot('form-builder')
await shot('form-submissions', page.locator('[data-form-submissions]'))

// the visual editor, with the sidebar as an icon rail for room
await admin('/singletons/home')
await heading('Home page')
await page.locator('[data-visual-editor]').first().click()
const preview = page.frameLocator('iframe[title="Preview of the page"]')
await preview.getByText('Exterior design').waitFor()
await page.locator('.app-rail-toggle').click().catch(() => {})
await settle()
await page.locator('.ate-tree__block', { hasText: 'Portfolio' }).nth(1).click()
// every image in the preview loaded
await preview.locator('body').evaluate(body => Promise.all([...body.querySelectorAll('img')].map(img => (img.loading = 'eager', img.decode().catch(() => {})))))
await settle()
await shot('visual-editor')
await page.keyboard.press('Control+k')
await page.keyboard.type('insert')
await settle()
await shot('visual-editor-commands')
await page.keyboard.press('Escape') // clears the search
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Comments' }).click()
await page.getByLabel('Add a comment').fill('Could this gallery open with the bench?')
await page.getByRole('button', { name: 'Comment', exact: true }).click()
await settle()
await shot('visual-editor-comments')
await page.getByRole('button', { name: 'Block' }).click()
await page.getByText('Reuse this block').click()
await settle()
await shot('visual-editor-reuse')

// --- the site
await page.goto(BASE)
await settle()
await shot('tutorial-home')
await shot('tutorial-portfolio', page.locator('h2', { hasText: 'Interior design' }).locator('xpath=ancestor::div[1]/..'))
await page.getByRole('button', { name: /Open Modern armchair/ }).click()
await settle()
await shot('tutorial-lightbox')
await page.keyboard.press('Escape')
await page.goto(`${BASE}/about`)
await settle()
await shot('tutorial-about')
await page.goto(`${BASE}/blog`)
await settle()
await shot('tutorial-blog')
await page.goto(`${BASE}/blog/linear-elegance`)
await settle()
await shot('tutorial-post')
const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' })
const night = await dark.newPage()
await night.goto(BASE)
await night.waitForLoadState('networkidle')
await night.waitForTimeout(600)
if (!ONLY.length || ONLY.includes('tutorial-dark'))
  await sharp(await night.screenshot()).webp({ quality: 82 }).toFile(join(OUT, 'tutorial-dark.webp')).then(() => console.log('tutorial-dark'))

await browser.close()
