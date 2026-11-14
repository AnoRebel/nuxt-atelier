// The visual editor's block tree: lists and areas, and edits that keep placement rules.
import type { BlockSchema } from '../../packages/core/src/runtime/shared/blocks'
import { describe, expect, it } from 'vitest'
import { allLists, blockTree, duplicate, insert, locate, move, newBlock, remove } from '../../packages/editor/src/runtime/tree'

const registry: Record<string, BlockSchema> = {
  Hero: { name: 'Hero', label: 'Hero', fields: {}, options: { tone: { type: 'select', options: ['a', 'b'], default: 'a' } as never }, areas: { items: { label: 'Items', allow: ['Card'], max: 2 } } },
  Card: { name: 'Card', fields: {}, options: {}, areas: {} },
  Quote: { name: 'Quote', fields: {}, options: {}, areas: {} },
}
const fields = { title: { type: 'text' }, content: { type: 'blocks', label: 'Content' } }
const data = {
  title: 'Page',
  content: [
    { id: 'h', type: 'Hero', props: { items: [{ id: 'c1', type: 'Card', props: {} }] } },
    { id: 'q', type: 'Quote', props: {} },
  ],
}

describe('editor block tree', () => {
  const lists = blockTree(data, fields, registry)

  it('lists the blocks fields and every area', () => {
    expect(allLists(lists).map(l => [l.path, l.label, l.blocks.map(b => b.id)])).toEqual([
      ['content', 'Content', ['h', 'q']],
      ['content.0.props.items', 'Items', ['c1']],
    ])
    expect(locate(lists, 'c1')).toMatchObject({ index: 0, list: { path: 'content.0.props.items' }, block: { path: 'content.0.props.items.0' } })
  })

  it('moves within a list and into areas that take the block, and nowhere else', () => {
    expect(move(data, lists, registry, 'q', 'content', 0)!.content.map(b => b.id)).toEqual(['q', 'h'])
    expect(move(data, lists, registry, 'h', 'content', 2)!.content.map(b => b.id)).toEqual(['q', 'h'])
    expect(move(data, lists, registry, 'q', 'content.0.props.items', 0)).toBeUndefined() // Items allows only Card
    expect(move(data, lists, registry, 'h', 'content.0.props.items', 0)).toBeUndefined() // not into itself
    const moved = move(data, lists, registry, 'c1', 'content', 1)!
    expect(moved.content.map(b => b.id)).toEqual(['h', 'c1', 'q'])
    expect((moved.content[0]!.props as { items: unknown[] }).items).toEqual([])
    expect(data.content[0]!.props.items).toHaveLength(1) // the original is untouched
  })

  it('duplicates with fresh ids while there\'s room, inserts, creates with defaults, removes', () => {
    const copied = duplicate(data, lists, registry, 'c1')!
    const items = (copied.data.content[0]!.props as { items: { id: string }[] }).items
    expect(items.map(i => i.id)).toEqual(['c1', copied.id])
    expect(copied.id).not.toBe('c1')
    const full = blockTree(copied.data, fields, registry)
    expect(duplicate(copied.data, full, registry, 'c1')).toBeUndefined() // Items holds at most 2

    const hero = newBlock('Hero', registry)
    expect(hero).toMatchObject({ type: 'Hero', props: { tone: 'a', items: [] } })
    expect(insert(data, 'content', 1, hero).content.map(b => b.type)).toEqual(['Hero', 'Hero', 'Quote'])
    expect(remove(data, lists, 'h').content.map(b => b.id)).toEqual(['q'])
  })
})
