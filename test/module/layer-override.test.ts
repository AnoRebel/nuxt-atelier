// A layer file the app has too: the app's is used.
import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { adminEnv, firstAdmin } from './layer-helpers'

describe('starter layer, overridden by the host', async () => {
  await setup({ setupTimeout: 300_000, browser: true, rootDir: fileURLToPath(new URL('../fixtures/layer-override', import.meta.url)), env: adminEnv('layer-override') })

  it('uses the app\'s admin home instead of the layer\'s', async () => {
    const page = await createPage(url('/admin'))
    await firstAdmin(page)
    await page.locator('[data-host-home]').waitFor()
    expect(await page.locator('[data-layer-home]').count()).toBe(0)
  })
})
