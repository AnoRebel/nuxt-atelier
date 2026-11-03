import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const page = async (path: string) => (await $fetch<string>(path)).replace(/<!--.*?-->/g, '')

describe('non-invasive host integration', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../fixtures/host-app', import.meta.url)) })

  it.each([['/', 'Host home'], ['/about', 'Host about']])('renders the host page %s in the host app.vue and layout', async (path, title) => {
    expect(await page(path)).toContain(`<div id="host-root"><main data-host-app><div data-host-layout><h1>${title}</h1></div></main></div>`)
  })

  it('leaves unmatched paths to the host (404)', async () => {
    await expect($fetch('/not-a-page')).rejects.toMatchObject({ statusCode: 404 })
  })
})
