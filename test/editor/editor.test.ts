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
import sharp from 'sharp'
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
  async function openEditor(entryId?: string, page?: Page): Promise<Page> {
    page ??= await createPage(url('/admin'))
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
    await page.goto(url(`/admin/collections/pages/${entryId ?? pageId}`))
    await page.locator('[data-visual-editor]').first().click()
    await page.frameLocator('iframe[title="Preview of the page"]').locator('[data-at-block]').first().waitFor()
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

  it('inserts a block from the command palette, undoably, and keeps Ctrl+K for itself', async () => {
    const page = await openEditor()
    await page.locator('[data-tree-block="h1"]').click()
    const field = page.getByRole('combobox', { name: 'Type a command' })
    // Ctrl+K toggles it: press it until it's open (a press while the last one closes can be lost under load)
    const openPalette = () => expect.poll(async () => {
      if (!await field.isVisible())
        await page.keyboard.press('Control+k')
      return field.isVisible()
    }, { intervals: [500] }).toBe(true)
    await openPalette()
    expect(await page.getByRole('dialog', { name: 'Search' }).count()).toBe(0) // not the admin's search
    await field.fill('insert card')
    await page.getByRole('option', { name: /Insert Card/ }).waitFor()
    await page.keyboard.press('Enter')
    // after the selected block, and selected
    await expect.poll(async () => (await treeOrder(page)).length).toBe(4)
    const [first, inserted] = await treeOrder(page)
    expect(first).toBe('h1')
    await page.locator(`[data-tree-block="${inserted}"][aria-pressed="true"]`).waitFor()
    expect(await page.locator(`[data-tree-block="${inserted}"]`).textContent()).toContain('Card')
    // undone from the palette too
    await openPalette()
    await field.fill('undo')
    await page.keyboard.press('Enter')
    await expect.poll(() => treeOrder(page)).toEqual(['h1', 's1', 't1'])
    // a command a plugin added (test/fixtures/editor/app/plugins/commands.client.ts)
    await openPalette()
    await field.fill('shout')
    await page.keyboard.press('Enter')
    await expect.poll(() => preview(page).locator('[data-at-field="title"]').textContent()).toMatch(/!\s*$/)
  })

  it('inserts a pattern as copies, saves a block as a shared block and detaches it', async () => {
    const page = await openEditor()
    await page.locator('[data-tree-block="t1"]').click()
    await page.locator('[data-pattern="code:intro"]').click()
    await expect.poll(async () => (await treeOrder(page)).length).toBe(5)
    const order = await treeOrder(page)
    expect(order.slice(0, 3)).toEqual(['h1', 's1', 't1'])
    expect(order.slice(3)).not.toContain('i1') // fresh ids
    await preview(page).getByText('Pattern headline').waitFor()
    await preview(page).getByText('Beta').waitFor()

    // the page's headline, saved as a shared block: placed by reference from then on
    await page.locator('[data-tree-block="h1"]').click()
    await page.getByText('Reuse this block').click()
    await page.getByLabel('Title').fill('Hero headline')
    await page.getByRole('button', { name: 'Save as shared block' }).click()
    await page.locator('[data-detach]').waitFor()
    await page.locator('[data-shared-block]').getByText('Hero headline').waitFor()
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByText('Saved').first().waitFor()
    const content = async () => page.evaluate(async id => (await (await window.fetch(`/api/_atelier/collections/pages/${id}?draft=true`)).json()).data.content as { id: string, type: string, shared?: string }[], pageId)
    expect((await content())[0]).toMatchObject({ id: 'h1', type: 'Headline', shared: expect.any(String) })
    // detached: the page's own again, looking the same
    await page.locator('[data-detach]').click()
    await expect.poll(async () => page.locator('[data-detach]').count()).toBe(0)
    await preview(page).getByText('Original headline').waitFor()
  })

  it('copies a block in one entry and pastes it in another, within the placement rules', async () => {
    const page = await openEditor()
    const otherId = await page.evaluate(async () => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: { title: 'Other', slug: 'other', content: [{ id: 'o1', type: 'Section', props: { heading: 'Other section', items: [] } }] } }) })
      return (await response.json()).id as string
    })
    await page.locator('[data-tree-block="h1"]').click()
    await page.keyboard.press('Control+c')
    await page.locator('[aria-live="polite"]').getByText('Headline copied').waitFor()

    // in another entry (another tab): after the selected section, as a copy with a fresh id
    const other = await openEditor(otherId, await createPage(url('/admin')))
    await other.locator('[data-tree-block="o1"]').click()
    await other.keyboard.press('Control+v')
    await expect.poll(() => treeOrder(other)).toHaveLength(2)
    const [, pasted] = await treeOrder(other)
    expect(pasted).not.toBe('h1')
    await preview(other).getByText('Original headline').waitFor()

    // a headline doesn't go in the section's cards-only area: refused, and said so
    await page.bringToFront()
    await page.locator('[data-tree-block="c1"]').click()
    await page.keyboard.press('Control+v')
    await page.locator('[aria-live="polite"]').getByText('Headline can\'t go there').waitFor()
    expect(await items(page)).toEqual(['Card'])
  })

  it('marks blocks with open comment threads in the preview, opening the thread in the comments panel', async () => {
    const page = await openEditor()
    const thread = await page.evaluate(async (id) => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const post = (body: unknown) => window.fetch(`/api/_atelier/comments/pages/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify(body) }).then(r => r.json())
      await post({ body: 'About the whole page' })
      return (await post({ body: 'This card needs a better heading', block: 'c1' })).id as string
    }, pageId)
    await page.reload()
    await preview(page).locator('[data-at-block]').first().waitFor()
    const marker = page.locator('[data-comment-marker="c1"]')
    await marker.waitFor()
    expect(await page.locator('[data-comment-marker]').count()).toBe(1) // the page's own comment has none
    expect(await marker.getAttribute('aria-label')).toBe('1 open comment threads on Card')
    await marker.click()
    await page.locator(`[data-comment="${thread}"]`).getByText('This card needs a better heading').waitFor()
    await page.locator('[data-tree-block="c1"][aria-pressed="true"]').waitFor()
  })

  it('edits rich text in place, with formatting, into the form and the saved entry', async () => {
    const page = await openEditor()
    const textId = await page.evaluate(async () => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello rich world' }] }] }
      const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: { title: 'Rich', slug: 'rich', content: [{ id: 'x1', type: 'Text', props: { body } }] } }) })
      return (await response.json()).id as string
    })
    const editor = await openEditor(textId)
    const field = preview(editor).locator('[data-at-field="body"]')
    await field.getByText('Hello rich world').dblclick()
    await field.locator('.ProseMirror[contenteditable="true"]').waitFor()
    await editor.keyboard.press('End')
    await editor.keyboard.type(' again ')
    await editor.keyboard.press('Control+b')
    await editor.keyboard.type('boldly')
    await field.locator('.ProseMirror').evaluate((el: HTMLElement) => el.blur())
    // back to the page's own rendering, with the edit
    await field.locator('strong').getByText('boldly').waitFor()
    expect(await field.locator('.ProseMirror').count()).toBe(0)
    await expect.poll(() => field.textContent()).toContain('Hello rich world again boldly')
    // in the form too, and saved
    await editor.locator('[data-tree-block="x1"]').click()
    await editor.locator('[data-block-form]').getByText('Hello rich world again boldly').waitFor()
    await editor.getByRole('button', { name: 'Save draft' }).click()
    await editor.getByText('Saved').first().waitFor()
    const saved = await editor.evaluate(async id => (await (await window.fetch(`/api/_atelier/collections/pages/${id}?draft=true`)).json()).data.content[0].props.body, textId)
    expect(JSON.stringify(saved)).toContain('"type":"bold"')
  })

  it('shows a proxy-mode block with all its slides, reordered by dragging in the preview', async () => {
    const page = await openEditor()
    const carouselId = await page.evaluate(async () => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const slide = (id: string, heading: string) => ({ id, type: 'Card', props: { heading } })
      const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: { title: 'Slides', slug: 'slides', content: [{ id: 'k1', type: 'Carousel', props: { slides: [slide('a', 'Slide A'), slide('b', 'Slide B'), slide('c', 'Slide C')] } }] }, publish: true }) })
      return (await response.json()).id as string
    })
    // the public page shows one slide at a time
    const visitor = await createPage(url('/slides'))
    await visitor.getByText('Slide A').waitFor()
    expect(await visitor.getByText('Slide C').isVisible()).toBe(false)

    const editor = await openEditor(carouselId)
    const frame = preview(editor)
    await frame.locator('[data-at-proxy]').getByText('Slides', { exact: true }).waitFor()
    const slides = () => frame.locator('[data-at-proxy] [data-at-block]').evaluateAll(els => els.map(el => el.getAttribute('data-at-block')))
    expect(await slides()).toEqual(['a', 'b', 'c'])
    await frame.getByText('Slide C').waitFor({ state: 'visible' }) // every slide, in the preview
    // select slide C in the page, and drag it by its tag above slide A
    await frame.getByText('Slide C').click()
    await editor.locator('[data-tree-block="c"][aria-pressed="true"]').waitFor()
    await drag(editor, editor.locator('[data-overlay-handle]'), frame.locator('[data-at-block="a"]'), { x: 0.05, y: 0.2 })
    await expect.poll(slides).toEqual(['c', 'a', 'b'])
    expect(await editor.locator('[data-list="content.0.props.slides"] > li > [data-tree-block]').evaluateAll(els => els.map(el => el.getAttribute('data-tree-block')))).toEqual(['c', 'a', 'b'])
  })

  it('keeps its chrome and the preview apart from the host\'s global CSS', async () => {
    // the fixture's app/assets/hostile.css: `* { box-sizing: content-box }`, `button { all: unset }`
    const plainId = await (await openEditor()).evaluate(async () => {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('atelier-csrf='))!.slice('atelier-csrf='.length)
      const content = [{ id: 'p1', type: 'Headline', props: { heading: 'Plain headline' } }, { id: 'p2', type: 'Section', props: { heading: 'Plain section', items: [{ id: 'p3', type: 'Card', props: { heading: 'Plain card' } }] } }]
      const response = await window.fetch('/api/_atelier/collections/pages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-atelier-csrf': csrf }, body: JSON.stringify({ data: { title: 'Plain', slug: 'plain', content }, publish: true }) })
      return (await response.json()).id as string
    })
    const page = await openEditor(plainId)
    const undo = page.getByRole('button', { name: 'Undo' })
    const style = await undo.evaluate((el) => {
      const s = getComputedStyle(el)
      return { boxSizing: s.boxSizing, display: s.display, paddingLeft: s.paddingLeft, cursor: s.cursor }
    })
    expect(style.boxSizing).toBe('border-box')
    expect(style.display).not.toBe('inline')
    expect(style.paddingLeft).not.toBe('0px')
    expect(style.cursor).toBe('pointer')
    expect(await page.locator('[data-tree-block="p1"]').evaluate(el => getComputedStyle(el).display)).toBe('block')

    // the preview, at the mobile width, is the public page pixel for pixel (a window wide enough for the
    // stage to show the whole frame; the frame may sit a fraction of a pixel off, so a 1px shift is allowed)
    await page.setViewportSize({ width: 1600, height: 800 })
    await page.getByLabel('Custom').fill('375')
    const frame = page.locator('iframe[title="Preview of the page"]')
    await expect.poll(async () => (await frame.boundingBox())?.width).toBe(375)
    await page.mouse.move(0, 0) // no hover box over it
    await page.waitForTimeout(300)
    const box = (await frame.boundingBox())!
    const visitor = await createPage(url('/plain'), { viewport: { width: 375, height: Math.floor(box.height) } })
    await visitor.getByText('Plain card').waitFor()
    const raw = async (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const [inEditor, onSite] = await Promise.all([raw(await frame.screenshot()), raw(await visitor.screenshot())])
    const width = Math.min(inEditor.info.width, onSite.info.width) - 2
    const height = Math.min(inEditor.info.height, onSite.info.height) - 2
    const differing = (dx: number, dy: number) => {
      let count = 0
      for (let y = 1; y < height; y++) {
        for (let x = 1; x < width; x++) {
          const a = (y * inEditor.info.width + x) * 4
          const b = ((y + dy) * onSite.info.width + x + dx) * 4
          if (Math.abs(inEditor.data[a]! - onSite.data[b]!) + Math.abs(inEditor.data[a + 1]! - onSite.data[b + 1]!) + Math.abs(inEditor.data[a + 2]! - onSite.data[b + 2]!) > 24)
            count++
        }
      }
      return count / (width * height)
    }
    const best = Math.min(...[-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => differing(dx, dy))))
    expect(best).toBeLessThan(0.001)
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
