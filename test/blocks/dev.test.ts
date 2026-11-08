import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/blocks-dev', import.meta.url))
const card = fileURLToPath(new URL('../fixtures/blocks-dev/app/blocks/Card.vue', import.meta.url))
const original = readFileSync(card, 'utf8')

describe('blocks in nuxt dev', async () => {
  afterAll(() => writeFileSync(card, original)) // registered before setup, so it runs after the server stops
  await setup({ rootDir, dev: true, setupTimeout: 300_000 })

  it('updates the server\'s block schemas when a block file changes, without a restart', async () => {
    expect(Object.keys((await $fetch<Record<string, { fields: object }>>('/api/blocks')).Card!.fields)).toEqual(['heading'])
    writeFileSync(card, original.replace('defineProps({ heading: text() })', 'defineProps({ heading: text(), subtitle: text({ maxLength: 40 }) })'))
    let fields: string[] = []
    for (let i = 0; i < 60 && fields.length < 2; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      fields = Object.keys((await $fetch<Record<string, { fields: object }>>('/api/blocks').catch(() => ({ Card: { fields: {} } }))).Card?.fields ?? {})
    }
    expect(fields).toEqual(['heading', 'subtitle'])
  }, 60_000)
})
