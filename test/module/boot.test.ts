import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('zero-config install', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)) })

  it('boots and serves the host app', async () => {
    expect(await $fetch('/')).toContain('<html')
  })
})
