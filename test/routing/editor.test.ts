// The visual editor's page side (test/fixtures/routing, with app/pages/editor-harness.vue standing in for
// the editor): a page enters edit mode only with a valid token, renders the editor's unsaved state, and
// reports blocks, clicks, placeholders and in-place edits. Public pages never load the bridge.
import type { Page } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/routing', import.meta.url))

describe('visual editor bridge', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  let pageId = ''

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-editor-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'admin@example.com', role: 'admin', password: 'password 123' } })
  })

  /** A browser signed in as the administrator, with the page to edit created. */
  async function signedIn(): Promise<Page> {
    const page = await createPage(url('/'))
    await page.evaluate(() => window.fetch('/api/_atelier/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'password 123' }) }))
    if (!pageId) {
      pageId = await page.evaluate(async () => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
        const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: {
          title: 'Editable',
          slug: 'editable',
          content: [
            { id: 'h1', type: 'Headline', props: { heading: 'Original headline' } },
            { id: 't1', type: 'Teasers', props: {} },
          ],
        } }) })
        return (await response.json()).id as string
      })
    }
    return page
  }
  /** The editor's URL for the page, with a fresh token (as the admin's editor asks for one). */
  const editUrl = (page: Page) => page.evaluate(async (id) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
    const response = await window.fetch('/api/_atelier/editor/token', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ type: 'pages', id }) })
    return (await response.json()).url as string
  }, pageId)
  /** Opens the harness framing `src`, collecting the bridge's messages on `window.received`. */
  async function harness(page: Page, src: string) {
    await page.addInitScript(() => {
      const w = window as unknown as { received: { type: string }[] }
      w.received = []
      addEventListener('message', event => w.received.push(event.data))
    })
    await page.goto(url(`/editor-harness?src=${encodeURIComponent(src)}`))
    return page.frameLocator('#frame')
  }
  const received = (page: Page) => page.evaluate(() => (window as unknown as { received: { type: string, [key: string]: unknown }[] }).received)

  it('loads no editor code on public pages, and renders a page public without a valid token', async () => {
    const page = await signedIn()
    const scripts: Promise<string>[] = []
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script')
        scripts.push(response.text())
    })
    await page.goto(url('/editable'))
    await page.getByText('Original headline').waitFor()
    expect((await Promise.all(scripts)).some(code => code.includes('atelier:geometry'))).toBe(false)

    const frame = await harness(page, '/editable?_atelier=edit&_atelier_token=forged')
    await frame.getByText('Original headline').waitFor()
    await page.waitForTimeout(500)
    expect((await received(page)).map(m => m.type)).toEqual([]) // no bridge, no messages
    expect(await frame.locator('[data-at-block]').count()).toBe(0)
  })

  it('renders the editor\'s unsaved state within 150 ms, and reports blocks, placeholders and clicks', async () => {
    const page = await signedIn()
    const frame = await harness(page, await editUrl(page))
    await expect.poll(async () => (await received(page)).some(m => m.type === 'atelier:geometry')).toBe(true)
    const geometry = (await received(page)).findLast(m => m.type === 'atelier:geometry') as unknown as { blocks: { id: string, placeholder?: boolean }[] }
    expect(geometry.blocks.map(b => [b.id, !!b.placeholder])).toEqual([['h1', false], ['t1', true]]) // the empty list gets a stand-in
    await frame.locator('[data-at-placeholder]').getByText('Teasers').waitFor()

    // an edit: the page shows it at once, with no save
    const elapsed = await page.evaluate(async (id) => {
      const frameWindow = (document.getElementById('frame') as HTMLIFrameElement).contentWindow!
      const started = performance.now()
      frameWindow.postMessage({ type: 'atelier:state', version: 1, id, data: { title: 'Editable', slug: 'editable', content: [{ id: 'h1', type: 'Headline', props: { heading: 'Changed headline' } }, { id: 't1', type: 'Teasers', props: { items: 'One,Two' } }] } }, location.origin)
      const doc = frameWindow.document
      while (!doc.body.textContent?.includes('Changed headline'))
        await new Promise(resolve => requestAnimationFrame(resolve))
      return performance.now() - started
    }, pageId)
    expect(elapsed).toBeLessThan(150)
    await frame.getByText('Two').waitFor() // the list has items now: no stand-in
    expect(await frame.locator('[data-at-placeholder]').count()).toBe(0)

    // a click selects the block, and follows nothing
    await frame.getByText('Changed headline').click()
    await expect.poll(async () => (await received(page)).some(m => m.type === 'atelier:select' && m.id === 'h1')).toBe(true)
  })

  it('passes on in-place text edits of marked fields', async () => {
    const page = await signedIn()
    const frame = await harness(page, await editUrl(page))
    const field = frame.locator('[data-at-field="heading"]')
    await field.waitFor()
    await field.dblclick()
    await page.keyboard.press('End')
    await page.keyboard.type(' now')
    await expect.poll(async () => (await received(page)).filter(m => m.type === 'atelier:inline').at(-1)).toMatchObject({ path: 'h1/heading', value: expect.stringContaining('Original headline now') })
  })

  it('ignores messages from anyone but the editor\'s frame', async () => {
    const page = await signedIn()
    const frame = await harness(page, await editUrl(page))
    await expect.poll(async () => (await received(page)).some(m => m.type === 'atelier:geometry')).toBe(true)
    // the page itself (not its parent) sends a state: ignored
    await frame.locator('body').evaluate((_, id) => window.postMessage({ type: 'atelier:state', version: 1, id, data: { content: [{ id: 'x', type: 'Headline', props: { heading: 'Injected' } }] } }, location.origin), pageId)
    await page.waitForTimeout(300)
    expect(await frame.getByText('Injected').count()).toBe(0)
  })
})
