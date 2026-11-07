// The content adapter contract suite. Any adapter runs it with a factory that returns a fresh adapter and
// two refs: a new entry of a collection with `title` (text) and `body` (blocks) fields, and a singleton
// with a `title` field. Required operations always run; optional ones run when the adapter reports them,
// and the suite checks the capability map matches what the adapter claims to support.
import type { AdapterCapabilities, ContentRef, DefinedContentAdapter, EditState } from '../../packages/core/src/adapter'
import { describe, expect, it } from 'vitest'

export interface ContractSetup {
  adapter: DefinedContentAdapter
  entry: ContentRef
  singleton: ContentRef
}

const hero = (id: string, props = {}) => ({ id, type: 'hero', props })
const ids = (state: EditState, field = 'body') => (state.data[field] as { id: string }[]).map(b => b.id)

export function contentAdapterContract(name: string, setup: () => Promise<ContractSetup>, expected: AdapterCapabilities) {
  describe(`content adapter contract: ${name}`, () => {
    it('reports its capabilities', async () => {
      const { adapter } = await setup()
      expect(adapter.capabilities).toEqual(expected)
    })

    it('loads a new edit state, unsaved', async () => {
      const { adapter, entry } = await setup()
      const state = await adapter.loadEditState(entry)
      expect(state).toMatchObject({ ref: entry, version: null })
    })

    it('describes fields as JSON and lists block types', async () => {
      const { adapter, entry } = await setup()
      const fields = await adapter.getFieldConfig(entry)
      expect(JSON.parse(JSON.stringify(fields))).toEqual(fields)
      expect(fields).toHaveProperty('body.type', 'blocks')
      expect(Array.isArray(await adapter.listBlockTypes())).toBe(true)
    })

    it('adds, moves, updates and deletes blocks, nested ones too, without mutating the state it got', async () => {
      const { adapter, entry } = await setup()
      const start = await adapter.loadEditState(entry)
      let state = await adapter.addBlock(start, { field: 'body' }, hero('a'))
      state = await adapter.addBlock(state, { field: 'body' }, hero('b'))
      state = await adapter.addBlock(state, { field: 'body' }, hero('c'), 0)
      expect(ids(state)).toEqual(['c', 'a', 'b'])
      expect(start.data.body ?? []).toEqual([])

      state = await adapter.moveBlock(state, 'c', { field: 'body' }, 2)
      expect(ids(state)).toEqual(['a', 'b', 'c'])
      state = await adapter.addBlock(state, { parent: 'a', area: 'children' }, hero('a1'))
      state = await adapter.moveBlock(state, 'b', { parent: 'a', area: 'children' })
      expect(ids(state)).toEqual(['a', 'c'])
      expect((state.data.body as any)[0].props.children.map((b: { id: string }) => b.id)).toEqual(['a1', 'b'])

      state = await adapter.updateBlock(state, 'a1', { title: 'Nested' })
      expect((state.data.body as any)[0].props.children[0].props).toEqual({ title: 'Nested' })
      state = await adapter.deleteBlock(state, 'c')
      expect(ids(state)).toEqual(['a'])
    })

    it('refuses bad block operations with a 400', async () => {
      const { adapter, entry } = await setup()
      const state = await adapter.addBlock(await adapter.loadEditState(entry), { field: 'body' }, hero('a'))
      await expect(adapter.updateBlock(state, 'missing', {})).rejects.toMatchObject({ statusCode: 400 })
      await expect(adapter.addBlock(state, { field: 'body' }, hero('a'))).rejects.toMatchObject({ statusCode: 400 })
      await expect(adapter.moveBlock(state, 'a', { parent: 'a', area: 'children' })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('saves, reloads, and refuses a stale save with 409 and the current version', async () => {
      const { adapter, entry } = await setup()
      let state = await adapter.addBlock(await adapter.loadEditState(entry), { field: 'body' }, hero('a', { title: 'Hi' }))
      state = { ...state, data: { ...state.data, title: 'Page' } }
      const saved = await adapter.save(state)
      expect(saved.version).toBe(1)
      const reloaded = await adapter.loadEditState(saved.ref)
      expect(reloaded).toMatchObject({ version: 1, data: { title: 'Page', body: [hero('a', { title: 'Hi' })] } })

      const second = await adapter.save({ ...reloaded, data: { ...reloaded.data, title: 'Page 2' } })
      expect(second.version).toBe(2)
      await expect(adapter.save({ ...reloaded, data: { ...reloaded.data, title: 'Stale' } }))
        .rejects.toMatchObject({ statusCode: 409, data: { currentVersion: 2 } })
    })

    it('saves a singleton', async () => {
      const { adapter, singleton } = await setup()
      const state = await adapter.loadEditState(singleton)
      const saved = await adapter.save({ ...state, data: { ...state.data, title: 'Site' } })
      expect(await adapter.loadEditState(singleton)).toMatchObject({ version: saved.version, data: { title: 'Site' } })
    })

    it('answers permissions', async () => {
      const { adapter, entry } = await setup()
      const permissions = await adapter.permissions(entry)
      expect(typeof permissions.read).toBe('boolean')
      expect(typeof permissions.update).toBe('boolean')
    })

    it.runIf(expected.revisions)('lists and loads revisions', async () => {
      const { adapter, entry } = await setup()
      const state = await adapter.loadEditState(entry)
      const v1 = await adapter.save({ ...state, data: { ...state.data, title: 'One' } })
      await adapter.save({ ...v1, data: { ...v1.data, title: 'Two' } })
      expect((await adapter.revisions!.list(v1.ref)).map(r => r.version)).toEqual([2, 1])
      expect((await adapter.revisions!.load(v1.ref, 1)).data.title).toBe('One')
    })

    it.runIf(!expected.revisions)('has no revision operations', async () => {
      const { adapter } = await setup()
      expect(adapter.revisions).toBeUndefined()
    })
  })
}
