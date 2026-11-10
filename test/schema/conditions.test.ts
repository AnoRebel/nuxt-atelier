import { describe, expect, it } from 'vitest'
import { buildTables } from '../../packages/core/src/runtime/server/db/tables'
import * as f from '../../packages/core/src/runtime/shared/fields'

describe('conditional fields', () => {
  const fields = {
    linkType: f.select({ options: ['internal', 'external'], required: true }),
    url: f.url({ required: true, when: { field: 'linkType', eq: 'external' } }),
    page: f.text({ when: { field: 'linkType', ne: 'external' } }),
  }

  it('drops a field whose condition is false, and requires it only when true', async () => {
    expect(await f.validateEntry(fields, { linkType: 'internal', page: 'about' })).toEqual({ success: true, value: { linkType: 'internal', url: undefined, page: 'about' } })
    // a stale value under a false condition isn't stored, valid or not
    expect(await f.validateEntry(fields, { linkType: 'internal', url: 'not a url' })).toMatchObject({ success: true, value: { url: undefined } })
    expect(await f.validateEntry(fields, { linkType: 'external' })).toEqual({ success: false, errors: [{ path: 'url', message: 'required' }] })
    expect(await f.validateEntry(fields, { linkType: 'external', url: 'https://example.com', page: 'about' })).toEqual({ success: true, value: { linkType: 'external', url: 'https://example.com', page: undefined } })
  })

  it('applies inside objects and repeaters, on siblings and top-level fields', async () => {
    const nested = {
      kind: f.select({ options: ['event', 'note'] }),
      cta: f.object({ fields: {
        style: f.select({ options: ['link', 'button'] }),
        label: f.text({ required: true, when: { field: 'style', eq: 'button' } }),
        date: f.date({ required: true, when: { field: '/kind', eq: 'event' } }),
      } }),
      items: f.repeater({ fields: {
        hasImage: f.boolean(),
        alt: f.text({ required: true, when: { field: 'hasImage', eq: true } }),
      } }),
    }
    const result = await f.validateEntry(nested, { kind: 'event', cta: { style: 'button' }, items: [{ hasImage: false, alt: 'x' }, { hasImage: true }] })
    expect(result).toEqual({ success: false, errors: [
      { path: 'cta.label', message: 'required' },
      { path: 'cta.date', message: 'required' },
      { path: 'items.1.alt', message: 'required' },
    ] })
    const ok = await f.validateEntry(nested, { kind: 'note', cta: { style: 'link', label: 'kept?' }, items: [{ hasImage: false, alt: 'x' }] })
    expect(ok).toMatchObject({ success: true, value: { cta: { style: 'link' }, items: [{ hasImage: false }] } })
    // not stored: undefined, which JSON storage leaves out
    const value = (ok as unknown as { value: { cta: { label?: string }, items: { alt?: string }[] } }).value
    expect([value.cta.label, value.items[0]!.alt]).toEqual([undefined, undefined])
    expect(JSON.stringify(value)).not.toMatch(/kept\?|"alt"/)
  })

  it('takes one of, not equal to, and set', () => {
    const field = (when: f.Condition) => f.text({ when })
    expect(f.applies(field({ field: 'a', in: [1, 2] }), { a: 2 }, {})).toBe(true)
    expect(f.applies(field({ field: 'a', in: [1, 2] }), { a: 3 }, {})).toBe(false)
    expect(f.applies(field({ field: 'a', set: true }), { a: '' }, {})).toBe(false)
    expect(f.applies(field({ field: 'a', set: true }), { a: ['x'] }, {})).toBe(true)
    expect(f.applies(field({ field: 'a', set: false }), {}, {})).toBe(true)
    expect(f.applies(field({ field: '/top', eq: 'y' }), { top: 'n' }, { top: 'y' })).toBe(true)
  })

  it('refuses a condition on a field that doesn\'t exist when the schema loads', () => {
    const build = (fields: f.Fields) => buildTables('sqlite', { collections: { links: { fields } }, singletons: {} })
    expect(() => build({ url: f.url({ when: { field: 'linkTyp', eq: 'external' } }) })).toThrow('field "url" applies when "linkTyp" …, but there\'s no sibling field "linkTyp"')
    expect(() => build({ box: f.object({ fields: { x: f.text({ when: { field: '/nope', set: true } }) } }) })).toThrow('no top-level field "nope"')
    expect(() => build({ kind: f.text(), box: f.object({ fields: { x: f.text({ when: { field: '/kind', set: true } }) } }) })).not.toThrow()
  })
})
