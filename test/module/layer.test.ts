import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('starter layer', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/layer', import.meta.url)) })

  it('provides the module and the theme', async () => {
    const html = (await $fetch<string>('/')).replace(/<!--.*?-->/g, '')
    expect(html).toContain('<div class="at-theme"><p>content</p></div>')
    expect(html).toContain('--at-color-primary')
    // the layer's nuxt.config installs the module
    expect(html).toContain('atelier:{siteUrl:""')
  })
})
