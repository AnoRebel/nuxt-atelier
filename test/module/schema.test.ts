import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('schema discovery', async () => {
  await setup({ setupTimeout: 300_000, rootDir: fileURLToPath(new URL('../fixtures/schema', import.meta.url)) })

  it('registers collections and singletons from the app and its layers; the app wins a name clash', async () => {
    expect(await $fetch('/api/schema')).toEqual({
      collections: { 'articles': 'Article', 'authors': 'Author', 'atelier-forms': 'Form', 'atelier-templates': 'Template' }, // and the built-in forms and templates
      singletons: { settings: 'Site settings' },
    })
  })
})
