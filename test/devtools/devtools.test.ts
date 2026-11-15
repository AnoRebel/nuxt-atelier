// @nuxt-atelier/devtools (test/fixtures/devtools): in dev with DevTools on, its panels register as DevTools 3
// custom tabs and DevTools 4 docks, with the actions; never in production or with DevTools off, and the
// actions are refused while devtools.disableAuthorization is set. The panels show what the CLI shows.
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'
import { projectFromNuxt, projectMigrationStatus } from '../../packages/core/src/project'
import { renderPanel } from '../../packages/devtools/src/panel'

// the app's own nuxi, not npx: npm reads the root package.json, whose Bun overrides it rejects
const NUXI = fileURLToPath(new URL('../fixtures/devtools/node_modules/.bin/nuxi', import.meta.url))

const cwd = fileURLToPath(new URL('../fixtures/devtools', import.meta.url))
process.env.NUXT_ATELIER_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-devtools-')), 'db.sqlite')}`

type Nuxt = Awaited<ReturnType<typeof loadNuxt>>
interface Tab { name: string, view: { type: string, src?: string, actions?: { label: string, handle: () => Promise<void> }[] } }

async function withNuxt<T>(options: { dev: boolean, devtools?: unknown }, fn: (nuxt: Nuxt) => Promise<T>): Promise<T> {
  const nuxt = await loadNuxt({ cwd, dev: options.dev, ready: true, overrides: { logLevel: 'silent', ...options.devtools === undefined ? {} : { devtools: options.devtools as never } } })
  try {
    return await fn(nuxt)
  }
  finally {
    await nuxt.close()
  }
}
const customTabs = async (nuxt: Nuxt) => {
  const tabs: Tab[] = []
  await (nuxt.callHook as (name: string, tabs: Tab[]) => Promise<void>)('devtools:customTabs', tabs)
  return tabs.filter(t => t.name.startsWith('atelier'))
}

describe('the DevTools integration', () => {
  it('adds DevTools 3 tabs and DevTools 4 docks and commands in dev', async () => {
    await withNuxt({ dev: true }, async (nuxt) => {
      const tabs = await customTabs(nuxt)
      expect(tabs.map(t => t.name)).toEqual(['atelier-schema', 'atelier-migrations', 'atelier-jobs', 'atelier-admin', 'atelier-actions'])
      expect(tabs.find(t => t.name === 'atelier-admin')!.view.src).toBe('/admin')
      expect(tabs.find(t => t.name === 'atelier-actions')!.view.actions!.map(a => a.label)).toEqual(['Apply pending migrations'])
      expect(nuxt.options.devServerHandlers.some(h => h.route === '/__atelier_devtools/:section')).toBe(true)

      const docks: { id: string, url: string }[] = []
      const commands: { id: string }[] = []
      await (nuxt.callHook as (name: string, ctx: unknown) => Promise<void>)('devtools:ready', { docks: { register: (d: { id: string, url: string }) => docks.push(d) }, commands: { register: (c: { id: string }) => commands.push(c) } })
      expect(docks.map(d => d.id)).toEqual(['atelier:schema', 'atelier:migrations', 'atelier:jobs', 'atelier:admin'])
      expect(commands.map(c => c.id)).toEqual(['atelier:apply-migrations'])
      expect(await customTabs(nuxt)).toEqual([]) // DevTools 4 is on: no DevTools 3 tabs as well
    })
  }, 120_000)

  it('shows the schema and the same migration status as the CLI', async () => {
    await withNuxt({ dev: true }, async (nuxt) => {
      const project = await projectFromNuxt(nuxt)
      const schema = await renderPanel(project, 'schema')
      expect(schema).toContain('<strong>notes</strong>')
      expect(schema).toContain('<code>atelier_c_notes</code>')
      const status = await projectMigrationStatus(project) // what `atelier migrate status` prints
      const migrations = await renderPanel(project, 'migrations')
      for (const name of [...status.applied, ...status.pending])
        expect(migrations).toContain(name)
      expect(migrations).toContain(status.pending.length ? 'Pending' : 'None: the database is up to date.')
      expect(await renderPanel(project, 'jobs')).toContain('No jobs.')
    })
  }, 120_000)

  it('refuses the actions without DevTools\' authorization', async () => {
    await withNuxt({ dev: true, devtools: { enabled: true, disableAuthorization: true } }, async (nuxt) => {
      expect((await customTabs(nuxt)).find(t => t.name === 'atelier-actions')!.view.actions).toEqual([])
      let handler: () => Promise<unknown> = async () => {}
      await (nuxt.callHook as (name: string, ctx: unknown) => Promise<void>)('devtools:ready', { docks: { register: () => {} }, commands: { register: (c: { handler: () => Promise<unknown> }) => handler = c.handler } })
      await expect(handler()).rejects.toThrow('disableAuthorization')
    })
  }, 120_000)

  it('registers nothing in production or with DevTools off', async () => {
    for (const options of [{ dev: false }, { dev: true, devtools: { enabled: false } }]) {
      await withNuxt(options, async (nuxt) => {
        expect(await customTabs(nuxt)).toEqual([])
        expect(nuxt.options.devServerHandlers.some(h => String(h.route).startsWith('/__atelier_devtools'))).toBe(false)
      })
    }
  }, 120_000)

  it('leaves nothing of itself in a production build', async () => {
    await promisify(execFile)(NUXI, ['build'], { cwd, maxBuffer: 64 * 1024 * 1024 })
    const files = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)])
    const found = files(join(cwd, '.output')).filter(file => /\.(?:m?js|json|html)$/.test(file) && /__atelier_devtools|atelier-actions|devtools:customTabs/.test(readFileSync(file, 'utf8')))
    expect(found).toEqual([])
  }, 600_000)
})
