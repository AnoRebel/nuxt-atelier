import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/blocks-dev', import.meta.url))
const card = fileURLToPath(new URL('../fixtures/blocks-dev/app/blocks/Card.vue', import.meta.url))
const original = readFileSync(card, 'utf8')

describe('blocks in nuxt dev', async () => {
  // a fresh database: one left from an earlier run may hold tables from a migration renamed since
  process.env.NUXT_ATELIER_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-blocks-dev-')), 'db.sqlite')}`
  afterAll(() => { // registered before setup, so it runs after the server stops
    writeFileSync(card, original)
    delete process.env.NUXT_ATELIER_DATABASE_URL
  })
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
