// The starter layer installs the module and the admin, and its admin home page is the one shown.
import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, it } from 'vitest'
import { adminEnv, firstAdmin } from './layer-helpers'

describe('starter layer', async () => {
  await setup({ setupTimeout: 300_000, browser: true, rootDir: fileURLToPath(new URL('../fixtures/layer', import.meta.url)), env: adminEnv('layer') })

  it('installs the module and the admin, with the layer\'s home page', async () => {
    const page = await createPage(url('/admin'))
    await firstAdmin(page)
    await page.locator('[data-layer-home]').waitFor()
  })
})
