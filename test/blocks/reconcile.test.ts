import type { BlockSchema } from '../../packages/core/src/runtime/shared/blocks'
import { describe, expect, it } from 'vitest'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { contentRepairs, findStaleContent } from '../../packages/core/src/runtime/shared/reconcile'

// the schemas today: Hero lost its `subtitle` and gained an `items` area since the content was saved
const blocks: Record<string, BlockSchema> = {
  Hero: { name: 'Hero', fields: { title: f.text({ required: true }) }, options: { variant: f.select({ options: ['a', 'b'] }) }, areas: { items: {} } },
  Card: { name: 'Card', fields: { heading: f.text() }, options: {}, areas: {} },
}
const fields = { title: f.text(), content: f.blocks(), faq: f.repeater({ fields: { question: f.text() } }) }
const saved = {
  title: 'Home',
  content: [
    { id: 'h', type: 'Hero', props: { title: 'Hi', subtitle: 'Old text', variant: 'a' } },
    { id: 'g', type: 'Gone', props: { x: 1 } },
  ],
  faq: [{ question: 'Q', answer: 'removed sub-field' }],
}

describe('schema reconciliation', () => {
  it('finds orphaned props and keys, unknown blocks and areas added since', () => {
    expect(findStaleContent(fields, saved, blocks)).toEqual([
      { kind: 'orphaned-prop', path: 'content.0.props.subtitle', blockId: 'h', type: 'Hero', prop: 'subtitle', value: 'Old text' },
      { kind: 'missing-area', path: 'content.0.props.items', blockId: 'h', type: 'Hero', area: 'items' },
      { kind: 'unknown-block', path: 'content.1', blockId: 'g', type: 'Gone' },
      { kind: 'orphaned-key', path: 'faq.0.answer', key: 'answer', value: 'removed sub-field' },
    ])
  })

  it('keeps stale content saveable: a removed field and an added area don\'t fail validation', async () => {
    const edited = { ...saved, title: 'Home, edited' } // an unrelated change
    expect(await f.validateEntry(fields, edited, { blocks })).toMatchObject({ success: true })
  })

  it('repairs: drop, move to a renamed field, and add the missing area, without changing the input', () => {
    const [orphan, area, unknown, key] = findStaleContent(fields, saved, blocks)
    const before = structuredClone(saved)

    const moved = contentRepairs.move(saved, orphan as never, 'title')
    expect((moved.content as any)[0].props).toEqual({ title: 'Hi', variant: 'a' }) // title was set: kept, subtitle dropped
    const dropped = contentRepairs.drop(saved, orphan!)
    expect((dropped.content as any)[0].props).not.toHaveProperty('subtitle')
    expect((contentRepairs.addArea(saved, area as never).content as any)[0].props.items).toEqual([])
    expect((contentRepairs.drop(saved, unknown!).content as any).map((b: { id: string }) => b.id)).toEqual(['h'])
    expect(contentRepairs.move(saved, key as never, 'question').faq).toEqual([{ question: 'Q' }])
    expect(saved).toEqual(before)

    let repaired: Record<string, unknown> = saved
    for (const item of findStaleContent(fields, saved, blocks))
      repaired = item.kind === 'missing-area' ? contentRepairs.addArea(repaired, item) : item.kind === 'unknown-block' ? repaired : contentRepairs.drop(repaired, item)
    expect(findStaleContent(fields, repaired, blocks).map(i => i.kind)).toEqual(['unknown-block'])
  })
})
