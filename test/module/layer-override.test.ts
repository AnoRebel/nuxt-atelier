import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('starter layer, overridden by the host', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/layer-override', import.meta.url)) })

  it('uses the host file instead of the layer file', async () => {
    const html = (await $fetch<string>('/')).replace(/<!--.*?-->/g, '')
    expect(html).toContain('<div class="host-theme"><p>content</p></div>')
    expect(html).not.toContain('at-theme')
  })
})
