import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// the install the docs describe (test/fixtures/zero-config): nuxt-atelier and its admin, with no options
describe('zero-config install', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/zero-config', import.meta.url)), browser: true })

  it('boots and serves the host app', async () => {
    expect(await $fetch('/')).toContain('A fresh Nuxt app')
  })

  it('serves the admin at /admin, which asks for the first administrator', async () => {
    expect(await $fetch('/api/_atelier/setup')).toEqual({ needed: true, token: false })
    const page = await createPage(url('/admin'))
    await page.getByRole('heading', { name: 'Welcome' }).waitFor()
    await page.getByRole('button', { name: 'Create administrator' }).waitFor()
  })
})
