// Headless mode: the core without @nuxt-atelier/admin adds no admin route or assets.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('headless', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)), setupTimeout: 300_000 })

  it('adds no admin route without the admin package', async () => {
    const response = await fetch('/admin')
    expect(response.headers.get('x-robots-tag')).toBeNull()
    expect(await response.text()).not.toContain('atelier-admin')
  })
})
