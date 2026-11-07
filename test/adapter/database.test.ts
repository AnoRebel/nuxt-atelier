import type { ContentRef } from '../../packages/core/src/adapter'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTENT_ADAPTER_CONTRACT, defineContentAdapter } from '../../packages/core/src/adapter'
import { createDatabaseAdapter } from '../../packages/core/src/runtime/server/adapter'
import { createEntryStore } from '../../packages/core/src/runtime/server/db/store'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { connectEngine, createTables } from '../storage/env'
import { contentAdapterContract } from './contract'

const schema = {
  collections: { pages: { fields: { title: f.text(), body: f.blocks() } } },
  singletons: { site: { fields: { title: f.text() } } },
}
const allowAll = () => ({ read: true, update: true })

async function databaseAdapter(permissions = allowAll) {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-adapter-'))
  const url = `file:${join(dir, 'db.sqlite')}`
  writeFileSync(join(dir, 'schema.json'), JSON.stringify(schema))
  const driver = await connectEngine(url)
  await createTables(driver, url, join(dir, 'schema.json'))
  return createDatabaseAdapter({ store: createEntryStore(driver, schema), schema, permissions })
}

contentAdapterContract('built-in database', async () => ({
  adapter: await databaseAdapter(),
  entry: { kind: 'collection', name: 'pages' },
  singleton: { kind: 'singleton', name: 'site' },
}), { revisions: true })

describe('database adapter', () => {
  const page: ContentRef = { kind: 'collection', name: 'pages' }

  it('refuses reads and saves the permissions deny, with 403', async () => {
    const adapter = await databaseAdapter(() => ({ read: true, update: false }))
    const state = await adapter.loadEditState(page)
    await expect(adapter.save(state)).rejects.toMatchObject({ statusCode: 403 })
    const hidden = await databaseAdapter(() => ({ read: false, update: false }))
    await expect(hidden.loadEditState(page)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('defineContentAdapter', () => {
  const base = { contract: CONTENT_ADAPTER_CONTRACT, name: 'partial' }

  it('names the missing required operations', () => {
    expect(() => defineContentAdapter({ ...base, loadEditState: async () => ({}) } as never))
      .toThrow('Content adapter "partial" is missing required operations: getFieldConfig, listBlockTypes, addBlock, moveBlock, updateBlock, deleteBlock, save, permissions')
  })

  it('refuses another contract version', () => {
    expect(() => defineContentAdapter({ ...base, contract: 2 } as never)).toThrow('implements contract 2; this version of nuxt-atelier supports contract 1')
  })
})
