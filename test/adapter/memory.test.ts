import { describe, expect, it } from 'vitest'
import { createMemoryAdapter } from '../../packages/core/src/adapter'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { contentAdapterContract } from './contract'

const options = {
  collections: { pages: { title: f.text(), body: f.blocks() } },
  singletons: { site: { title: f.text() } },
}

contentAdapterContract('in-memory reference', async () => ({
  adapter: createMemoryAdapter(options),
  entry: { kind: 'collection', name: 'pages' },
  singleton: { kind: 'singleton', name: 'site' },
}), { revisions: false })

describe('memory adapter', () => {
  it('keeps each adapter instance separate, as a per-session demo needs', async () => {
    const [a, b] = [createMemoryAdapter(options), createMemoryAdapter(options)]
    const state = await a.loadEditState({ kind: 'singleton', name: 'site' })
    await a.save({ ...state, data: { title: 'Only in a' } })
    expect((await b.loadEditState({ kind: 'singleton', name: 'site' })).version).toBeNull()
  })

  it('reports an unknown collection as 404', async () => {
    await expect(createMemoryAdapter(options).loadEditState({ kind: 'collection', name: 'nope' })).rejects.toMatchObject({ statusCode: 404 })
  })
})
