import { describe, expect, it } from 'vitest'
import { diffEntries } from '../../packages/core/src/runtime/shared/diff'

const block = (id: string, type: string, props: Record<string, unknown> = {}) => ({ id, type, props })

describe('diffEntries', () => {
  it('reports field changes, into objects, with lists as a whole', () => {
    expect(diffEntries(
      { title: 'A', seo: { title: 'x', noindex: false }, tags: ['a'], same: 1 },
      { title: 'B', seo: { title: 'y', noindex: false }, tags: ['a', 'b'], same: 1, added: true },
    )).toEqual([
      { kind: 'field', path: 'title', before: 'A', after: 'B' },
      { kind: 'field', path: 'seo.title', before: 'x', after: 'y' },
      { kind: 'field', path: 'tags', before: ['a'], after: ['a', 'b'] },
      { kind: 'field', path: 'added', before: undefined, after: true },
    ])
    expect(diffEntries({ a: { x: 1, y: [1, { z: 2 }] } }, { a: { y: [1, { z: 2 }], x: 1 } })).toEqual([]) // key order doesn't matter
  })

  it('reports added, removed and changed blocks by id, at any depth', () => {
    const before = { content: [block('h', 'Hero', { title: 'Hi', items: [block('c1', 'Card', { n: 1 })] }), block('q', 'Quote')] }
    const after = { content: [block('h', 'Hero', { title: 'Hello', items: [block('c1', 'Card', { n: 2 }), block('c2', 'Card')] })] }
    expect(diffEntries(before, after)).toEqual([
      { kind: 'changed', block: 'h', type: 'Hero', prop: 'title', before: 'Hi', after: 'Hello' },
      { kind: 'changed', block: 'c1', type: 'Card', prop: 'n', before: 1, after: 2 },
      { kind: 'added', block: 'c2', type: 'Card', at: { parent: 'h', area: 'items' }, index: 1 },
      { kind: 'removed', block: 'q', type: 'Quote', at: { field: 'content' }, index: 1 },
    ])
  })

  it('tells a move from a shift: only blocks out of order, or in another area, moved', () => {
    const list = (...ids: string[]) => ({ content: ids.map(id => block(id, 'Card')) })
    // inserting at the start shifts every index: nothing moved
    expect(diffEntries(list('a', 'b', 'c'), list('n', 'a', 'b', 'c')).map(c => c.kind)).toEqual(['added'])
    // dragging c to the top: c moved, a and b only shifted
    expect(diffEntries(list('a', 'b', 'c'), list('c', 'a', 'b'))).toEqual([
      { kind: 'moved', block: 'c', type: 'Card', from: { at: { field: 'content' }, index: 2 }, to: { at: { field: 'content' }, index: 0 } },
    ])
    // into another block's area, with its own children along
    const before = { content: [block('cols', 'Columns', { left: [block('x', 'Card', { body: [block('deep', 'Text')] })] }), block('y', 'Card')] }
    const after = { content: [block('cols', 'Columns', { left: [] }), block('y', 'Card', { body: [block('x', 'Card', { body: [block('deep', 'Text')] })] })] }
    expect(diffEntries(before, after)).toEqual([
      { kind: 'moved', block: 'x', type: 'Card', from: { at: { parent: 'cols', area: 'left' }, index: 0 }, to: { at: { parent: 'y', area: 'body' }, index: 0 } },
    ])
  })

  it('finds blocks in blocks fields nested in objects and lists', () => {
    const before = { sections: [{ heading: 'One', content: [block('a', 'Card')] }] }
    const after = { sections: [{ heading: 'Uno', content: [block('a', 'Card'), block('b', 'Card')] }] }
    expect(diffEntries(before, after)).toEqual([
      { kind: 'field', path: 'sections', before: [{ heading: 'One', content: [] }], after: [{ heading: 'Uno', content: [] }] },
      { kind: 'added', block: 'b', type: 'Card', at: { field: 'sections.0.content' }, index: 1 },
    ])
  })
})
