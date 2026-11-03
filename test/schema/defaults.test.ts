import { describe, expect, it } from 'vitest'
import * as f from '../../packages/core/src/runtime/shared/fields'

describe('default factories', () => {
  const fields = {
    title: f.text({ default: 'Untitled' }),
    tags: f.multiSelect({ options: ['a', 'b'], default: ['a'] }),
    items: f.repeater({ fields: { q: f.text() }, default: [{ q: 'First' }] }),
    seo: f.object({ fields: { keywords: f.json({ default: ['cms'] }), noindex: f.boolean({ default: false }) } }),
    note: f.text(),
  }

  it('fills declared defaults, nested object defaults included', () => {
    expect(f.defaultsFactory(fields)()).toEqual({
      title: 'Untitled',
      tags: ['a'],
      items: [{ q: 'First' }],
      seo: { keywords: ['cms'], noindex: false },
    })
  })

  // Regression: Pruvious #154, where blocks shared one default array by reference
  it('never shares array or object defaults between entries or blocks', () => {
    const create = f.defaultsFactory(fields)
    const a = create()
    const b = create()
    ;(a.tags as string[]).push('b')
    ;(a.items as { q: string }[])[0]!.q = 'Changed'
    ;((a.seo as { keywords: string[] }).keywords).push('vue')

    expect(b).toEqual(create())
    expect(b.tags).toEqual(['a'])
    expect(b.items).toEqual([{ q: 'First' }])
    expect((b.seo as { keywords: string[] }).keywords).toEqual(['cms'])
    expect(fields.tags.default).toEqual(['a'])
  })

  it('is not affected by later changes to the descriptor', () => {
    const tags = f.multiSelect({ options: ['a', 'b'], default: ['a'] })
    const create = f.defaultsFactory({ tags })
    ;(tags.default as unknown as string[]).push('b')
    expect(create().tags).toEqual(['a'])
  })
})
