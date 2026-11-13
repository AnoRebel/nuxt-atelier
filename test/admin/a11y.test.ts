// WCAG 2.2 AA in the admin: axe over its core views (inside the shadow root), light and dark, and at tablet
// width. Serious and critical violations fail.
import type { Page } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminEnv } from '../module/layer-helpers'

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

interface Violation { id: string, impact: string, help: string, nodes: { target: unknown[] }[] }

async function violations(page: Page): Promise<string[]> {
  if (!await page.evaluate(() => 'axe' in window))
    await page.addScriptTag({ content: axeSource })
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Violation[] }> } }).axe
    const result = await axe.run({ include: [['atelier-admin']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.impact}): ${v.help} at ${JSON.stringify(v.nodes.slice(0, 3).map(n => [n.target, (n as { failureSummary?: string }).failureSummary]))}`)
  })
  return found
}

describe('admin accessibility', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/admin', import.meta.url)), browser: true, setupTimeout: 300_000, env: adminEnv('a11y') })
  let page: Page

  beforeAll(async () => {
    page = await createPage(url('/admin'))
    await page.getByRole('button', { name: 'Create administrator' }).waitFor()
  })

  it('has no serious or critical violations on the core views, light and dark', async () => {
    const problems: Record<string, string[]> = {}
    problems.setup = await violations(page)
    await page.getByLabel('Email').fill('ada@example.com')
    await page.getByLabel('Password').fill('password 123')
    await page.getByRole('button', { name: 'Create administrator' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

    const views: [string, string, string][] = [
      ['dashboard', '/admin', 'Dashboard'],
      ['list', '/admin/collections/posts', 'Posts'],
      ['new entry', '/admin/collections/posts/new', 'New entry'],
      ['new article (SEO panel)', '/admin/collections/articles/new', 'New entry'],
      ['singleton', '/admin/singletons/settings', 'Site settings'],
      ['media', '/admin/media', 'Media'],
      ['users', '/admin/users', 'Users'],
      ['roles', '/admin/roles', 'Roles'],
      ['new role', '/admin/roles/new', 'New role'],
    ]
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(theme => localStorage.setItem('atelier-admin-appearance', JSON.stringify({ theme })), theme)
      for (const [name, path, heading] of views) {
        await page.goto(url(path))
        await page.getByRole('heading', { name: heading, exact: true }).first().waitFor()
        problems[`${name} (${theme})`] = await violations(page)
      }
      await page.getByRole('button', { name: 'Appearance' }).click()
      await page.getByRole('dialog', { name: 'Appearance' }).waitFor()
      problems[`appearance dialog (${theme})`] = await violations(page)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+k')
      await page.getByRole('dialog', { name: 'Search' }).getByRole('combobox').fill('e')
      problems[`search dialog (${theme})`] = await violations(page)
      await page.keyboard.press('Escape')
    }
    expect(Object.fromEntries(Object.entries(problems).filter(([, list]) => list.length))).toEqual({})

    // axe looks inside the shadow root: the form's inputs are checked for labels
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').waitFor()
    await page.addScriptTag({ content: axeSource })
    const labelled = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ passes: { nodes: unknown[] }[] }> } }).axe
      return (await axe.run({ include: [['atelier-admin']] }, { runOnly: ['label'] })).passes.flatMap(p => p.nodes).length
    })
    expect(labelled).toBeGreaterThan(5)
  })

  it('is usable at tablet width: navigation in a drawer, nothing wider than the screen', async () => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(url('/admin/collections/posts/new'))
    await page.getByLabel('Title *').waitFor()
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('atelier-admin')!.shadowRoot!.querySelector<HTMLElement>('[data-atelier-admin]')!
      return root.scrollWidth - root.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Posts' }).click()
    await page.getByRole('heading', { name: 'Posts', exact: true }).waitFor()
    expect(await violations(page)).toEqual([])
  })
})
