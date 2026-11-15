// The visual editor (test/fixtures/editor): the real page in a frame, selection in sync between the page,
// the structure and the form, moving blocks by keyboard (announced) and undoing it, editing the entry's
// own title in place, and an accessible chrome.
import type { Locator, Page } from 'playwright-core'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup, startServer, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/editor', import.meta.url))
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

describe('visual editor', async () => {
  await setup({ setupTimeout: 300_000, rootDir, browser: true })
  let pageId = ''

  beforeAll(async () => {
    await startServer({ env: {
      NUXT_ATELIER_DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'atelier-visual-')), 'db.sqlite')}`,
      NUXT_APP_SECRET: 'a-test-secret-that-is-long-enough-123456',
    } })
    await $fetch('/api/test/users', { method: 'POST', body: { email: 'ada@example.com', role: 'admin', password: 'password 123' } })
  })

  /** Signed in, on the editor for the test page (created the first time). */
  async function openEditor(): Promise<Page> {
    const page = await createPage(url('/admin'))
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
    if (!pageId) {
      pageId = await page.evaluate(async () => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
        const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: {
          title: 'Welcome',
          slug: 'welcome',
          content: [
            { id: 'h1', type: 'Headline', props: { heading: 'Original headline' } },
            { id: 's1', type: 'Section', props: { heading: 'Cards', items: [{ id: 'c1', type: 'Card', props: { heading: 'First card' } }] } },
            { id: 't1', type: 'Teasers', props: {} },
          ],
        } }) })
        return (await response.json()).id as string
      })
    }
    await page.goto(url(`/admin/collections/pages/${pageId}`))
    await page.locator('[data-visual-editor]').first().click()
    await page.frameLocator('iframe[title="Preview of the page"]').getByText('Original headline').waitFor()
    return page
  }
  const preview = (page: Page) => page.frameLocator('iframe[title="Preview of the page"]')
  const treeOrder = (page: Page) => page.locator('[data-list="content"] > li > [data-tree-block]').evaluateAll(els => els.map(el => el.getAttribute('data-tree-block')))

  it('selects a block clicked in the page in the structure and the form, and shows form edits in the page', async () => {
    const page = await openEditor()
    expect(await treeOrder(page)).toEqual(['h1', 's1', 't1'])
    await preview(page).getByText('First card').click()
    await page.locator('[data-tree-block="c1"][aria-pressed="true"]').waitFor()
    await page.locator('[data-overlay-selected]').getByText('Card').waitFor()
    const heading = page.locator('[data-block-form]').getByLabel('Heading *')
    expect(await heading.inputValue()).toBe('First card')
    await heading.fill('Edited card')
    await preview(page).getByText('Edited card').waitFor()
    // the empty list has a stand-in, selectable like any block
    await preview(page).locator('[data-at-placeholder]').click()
    await page.locator('[data-tree-block="t1"][aria-pressed="true"]').waitFor()
  })

  it('moves a block with the keyboard, announces it, and undoes the move', async () => {
    const page = await openEditor()
    await page.locator('[data-tree-block="t1"]').focus()
    await page.keyboard.press('Alt+ArrowUp')
    await expect.poll(() => treeOrder(page)).toEqual(['h1', 't1', 's1'])
    await page.locator('[aria-live="polite"]').getByText('Teasers moved to position 2 of content').waitFor()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => treeOrder(page)).toEqual(['h1', 's1', 't1'])
    await page.getByRole('button', { name: 'Redo' }).click()
    await expect.poll(() => treeOrder(page)).toEqual(['h1', 't1', 's1'])
  })

  it('edits the entry\'s own title in place, undoably, and saves the edits', async () => {
    const page = await openEditor()
    const title = preview(page).locator('[data-at-field="title"]')
    await title.dblclick()
    await page.keyboard.press('End')
    await page.keyboard.type(' home')
    await title.evaluate((el: HTMLElement) => el.blur())
    await expect.poll(() => title.textContent()).toContain('Welcome home')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => title.textContent()).toMatch(/^\s*Welcome\s*$/)
    await page.getByRole('button', { name: 'Redo' }).click()
    await expect.poll(() => title.textContent()).toContain('Welcome home')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Saved').first().waitFor()
    const saved = await page.evaluate(async id => (await (await window.fetch(`/api/_atelier/collections/pages/${id}?draft=true`)).json()).data.title, pageId)
    expect(saved).toBe('Welcome home')
  })

  /** Drags `source` to a point of `target` (fractions of its box), with the pointer, as a person would. */
  async function drag(page: Page, source: Locator, target: Locator, at = { x: 0.5, y: 0.75 }) {
    await source.hover()
    await page.mouse.down()
    const from = (await source.boundingBox())!
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
    const box = (await target.boundingBox())!
    await page.mouse.move(box.x + box.width * at.x, box.y + box.height * at.y, { steps: 8 })
    await page.mouse.up()
  }
  const items = (page: Page) => page.locator('[data-list="content.1.props.items"] > li > [data-tree-block]').evaluateAll(els => els.map(el => el.textContent?.trim()))

  it('drags blocks in the structure, from the palette and over the preview, and rejects drops the rules forbid', async () => {
    const page = await openEditor()
    const card = page.locator('[data-tree-block="c1"]')
    // the section's area takes cards only: a headline from the palette, or the page's headline, is refused
    await drag(page, page.locator('[data-palette-block="Headline"]'), card)
    await drag(page, page.locator('[data-tree-block="h1"]'), card)
    await page.waitForTimeout(200)
    expect(await items(page)).toEqual(['Card'])
    expect(await treeOrder(page)).toEqual(['h1', 's1', 't1'])
    // a card is taken
    await drag(page, page.locator('[data-palette-block="Card"]'), card)
    await expect.poll(() => items(page)).toEqual(['Card', 'Card'])
    // a block dragged within its list
    await drag(page, page.locator('[data-tree-block="h1"]'), page.locator('[data-tree-block="t1"]'))
    await expect.poll(() => treeOrder(page)).toEqual(['s1', 't1', 'h1'])
    // over the preview: dropped after the block under the pointer
    await drag(page, page.locator('[data-palette-block="Headline"]'), page.locator('iframe[title="Preview of the page"]').contentFrame().locator('[data-at-placeholder]'), { x: 0.05, y: 0.75 }) // the frame is wider than the stage: its left end is in view
    await expect.poll(async () => (await treeOrder(page)).length).toBe(4)
    expect((await treeOrder(page))[2]).not.toMatch(/^(s1|t1|h1)$/)
    await preview(page).getByText('Original headline').first().waitFor()
    // and undone like any edit
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => treeOrder(page)).toEqual(['s1', 't1', 'h1'])
  })

  it('has no serious accessibility problems in its chrome', async () => {
    const page = await openEditor()
    await page.addScriptTag({ content: axeSource })
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string, impact: string, nodes: unknown[] }[] }> } }).axe
      const result = await axe.run({ include: [['atelier-admin']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)
    })
    expect(violations).toEqual([])
  })
})
