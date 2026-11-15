// The packages as a user installs them (the packed tarballs, exactly what's published), in a fresh app outside
// the workspace: they load in plain Node, with no TypeScript loader, as Nuxt 5 loads modules; and an app made
// of the starter layer alone builds with Nuxt 5 behaviour and runs (module-integration: "Install from registry").
import type { ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStandaloneApp } from '../../scripts/standalone-app'
import { build, cleanup, enabled, expectRunning, freePort, run, SECRET, start, stop, tempDir } from './deploy'

const PACKAGES = ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/editor', '@nuxt-atelier/layer']

describe.skipIf(!enabled)('installed from the published packages', () => {
  let dir: string
  let server: { child: ChildProcess, output: () => string } | undefined
  beforeAll(async () => {
    dir = join(tempDir('registry'), 'my-site')
    await createStandaloneApp(dir, { packages: ['@nuxt-atelier/layer'] })
  }, 900_000)
  afterAll(async () => {
    await stop(server?.child)
    cleanup(dir)
  })

  it('loads every package in plain Node, without a TypeScript loader', async () => {
    const script = `for (const name of ${JSON.stringify(PACKAGES)}) {
      const loaded = (await import(name)).default
      console.log(name, typeof loaded === 'function' ? 'module' : Array.isArray(loaded?.modules) ? 'config' : 'unknown')
    }`
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir })
    expect(stdout.trim().split('\n')).toEqual(['nuxt-atelier module', '@nuxt-atelier/admin module', '@nuxt-atelier/editor module', '@nuxt-atelier/layer config'])
  })

  it('builds an app made of the starter layer, with Nuxt 5 behaviour, and runs it', async () => {
    writeFileSync(join(dir, 'nuxt.config.ts'), `export default defineNuxtConfig({
  extends: ['@nuxt-atelier/layer'],
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
`)
    await build(dir)
    await run(join(dir, 'node_modules/.bin/atelier'), ['migrate', 'apply'], { cwd: dir, env: { ...process.env, NUXT_ATELIER_DATABASE_URL: 'file:.data/atelier.sqlite' } })
    const port = await freePort()
    server = start(['node', '.output/server/index.mjs'], { cwd: dir, env: { PORT: String(port), NUXT_APP_SECRET: SECRET, NUXT_ATELIER_DATABASE_URL: 'file:.data/atelier.sqlite' } })
    await expectRunning(`http://127.0.0.1:${port}`, server.output)
  }, 900_000)
})
