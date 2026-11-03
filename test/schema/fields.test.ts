import type { Field } from '../../packages/core/src/runtime/shared/fields'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import * as f from '../../packages/core/src/runtime/shared/fields'

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

// [field, valid values, invalid values]
const cases: [string, Field, unknown[], unknown[]][] = [
  ['text', f.text(), ['', 'Hello'], [1, true, {}]],
  ['textarea', f.textarea({ rows: 4 }), ['line 1\nline 2'], [['a'], 3]],
  ['richText', f.richText(), [doc, { type: 'doc' }], ['<p>hi</p>', { type: 'paragraph' }, { type: 'doc', content: [{ text: 'no type' }] }]],
  ['number', f.number(), [0, -1.5, 42], ['1', Number.NaN, Infinity]],
  ['number (integer)', f.number({ integer: true }), [3, -7], [1.5, '3']],
  ['boolean', f.boolean(), [true, false], ['true', 0]],
  ['select', f.select({ options: ['draft', { value: 'published', label: 'Published' }] }), ['draft', 'published'], ['archived', 1]],
  ['multiSelect', f.multiSelect({ options: ['a', 'b', 'c'] }), [[], ['a', 'c']], [['a', 'a'], ['d'], 'a']],
  ['date', f.date(), ['2026-11-03'], ['03/11/2026', '2026-13-01', '2026-11-03T10:00:00Z']],
  ['date (datetime)', f.date({ mode: 'datetime' }), ['2026-11-03T09:30:00Z', '2026-11-03T09:30:00.123Z'], ['2026-11-03T09:30:00+02:00', '2026-11-03']],
  ['date (time)', f.date({ mode: 'time' }), ['09:30', '23:59'], ['9:30', '24:00', '09:30:00']],
  ['email', f.email(), ['ada@example.com'], ['ada', 'ada@', 5]],
  ['url', f.url(), ['https://example.com/a?b=1', 'http://localhost:3000'], ['javascript:alert(1)', 'ftp://example.com', '/relative', 'example.com']],
  ['slug', f.slug({ from: 'title' }), ['hello', 'hello-world-2'], ['Hello', 'hello--world', '-hello', 'hello world']],
  ['color', f.color(), ['#ff8800', '#FF8800'], ['#f80', '#ff880080', 'orange']],
  ['color (alpha)', f.color({ alpha: true }), ['#ff8800', '#ff880080'], ['#ff88008', 'rgba(0,0,0,0)']],
  ['json', f.json(), [1, 'a', [1, { b: null }], { nested: { list: [true] } }], [Number.NaN, { d: new Date(0) }, { f: () => 1 }, [undefined]]],
  ['media', f.media({ accept: ['image/*'] }), ['m_123'], [123, { id: 'm_1' }]],
  ['relation', f.relation({ to: 'authors' }), ['a_1'], [['a_1'], 7]],
  ['relation (many)', f.relation({ to: 'tags', many: true }), [[], ['t_1', 't_2']], [['t_1', 't_1'], 't_1', [1]]],
  ['object', f.object({ fields: { street: f.text(), zip: f.number({ integer: true }) } }), [{}, { street: 'Main', zip: 12345 }], [{ zip: '12345' }, { other: 1 }, 'Main']],
  ['repeater', f.repeater({ fields: { q: f.text(), a: f.richText() } }), [[], [{ q: 'Why?', a: doc }, {}]], [[{ q: 1 }], [{ x: 'y' }], { q: 'Why?' }]],
  ['blocks', f.blocks(), [[], [{ id: 'b1', type: 'hero', props: { title: 'Hi' } }]], [[{ id: 'b1', type: 'hero' }], [{ id: '', type: 'hero', props: {} }], [{ id: 'b1', type: '', props: {} }]]],
  ['blocks (allow)', f.blocks({ allow: ['hero'] }), [[{ id: 'b1', type: 'hero', props: {} }]], [[{ id: 'b1', type: 'cta', props: {} }]]],
]

describe.each(cases)('%s field', (_, field, valid, invalid) => {
  const schema = f.fieldSchema(field)

  it('is a serialisable descriptor', () => {
    expect(JSON.parse(JSON.stringify(field))).toEqual(field)
  })

  it.each(valid.map(x => [x]))('accepts %j', async (value) => {
    expect((await v.safeParseAsync(schema, value)).success).toBe(true)
  })

  it.each(invalid.map(x => [x]))('rejects %j', async (value) => {
    expect((await v.safeParseAsync(schema, value)).success).toBe(false)
  })

  it.each([[null], [undefined], [''], [[]]])('allows the empty value %j when not required', async (value) => {
    expect((await v.safeParseAsync(schema, value)).success).toBe(true)
  })
})

describe('entrySchema', () => {
  const schema = f.entrySchema({ title: f.text(), tags: f.relation({ to: 'tags', many: true }) })

  it('accepts known fields and rejects unknown ones', async () => {
    expect((await v.safeParseAsync(schema, { title: 'Hi', tags: ['t_1'] })).success).toBe(true)
    expect((await v.safeParseAsync(schema, { title: 'Hi', extra: 1 })).success).toBe(false)
  })
})

it('rejects an unknown field type', () => {
  expect(() => f.fieldSchema({ type: 'geo' } as unknown as Field)).toThrow('Unknown field type "geo"')
})
