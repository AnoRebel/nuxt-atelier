import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import * as f from '../../packages/core/src/runtime/shared/fields'

const alwaysUnique = async () => true

const errors = async (fields: Parameters<typeof f.validateEntry>[0], data: unknown, options?: f.ValidateOptions) => {
  const result = await f.validateEntry(fields, data, options)
  return result.success ? [] : result.errors
}

describe('declarative validation', () => {
  it('required: rejects missing, null, empty strings and empty lists', async () => {
    const fields = { title: f.text({ required: true }), tags: f.multiSelect({ options: ['a'], required: true }), note: f.text() }
    for (const data of [{}, { title: null, tags: null }, { title: '', tags: [] }]) {
      expect(await errors(fields, data)).toEqual([
        { path: 'title', message: 'required' },
        { path: 'tags', message: 'required' },
      ])
    }
    expect(await errors(fields, { title: 'Hi', tags: ['a'] })).toEqual([])
  })

  it('length and pattern', async () => {
    const fields = { code: f.text({ minLength: 2, maxLength: 4, pattern: '[A-Z]+', patternMessage: 'uppercase letters only' }) }
    expect(await errors(fields, { code: 'A' })).toEqual([{ path: 'code', message: 'expected at least 2 characters' }])
    expect(await errors(fields, { code: 'ABCDE' })).toEqual([{ path: 'code', message: 'expected at most 4 characters' }])
    expect(await errors(fields, { code: 'Ab' })).toEqual([{ path: 'code', message: 'uppercase letters only' }])
    expect(await errors(fields, { code: 'ABC' })).toEqual([])
  })

  it('pattern matches the whole value', async () => {
    expect(await errors({ code: f.text({ pattern: '[a-z]+' }) }, { code: 'abc1' })).toEqual([{ path: 'code', message: 'expected to match [a-z]+' }])
  })

  it('min and max', async () => {
    const fields = { qty: f.number({ min: 1, max: 10 }) }
    expect(await errors(fields, { qty: 0 })).toEqual([{ path: 'qty', message: 'expected 1 or more' }])
    expect(await errors(fields, { qty: 11 })).toEqual([{ path: 'qty', message: 'expected 10 or less' }])
    expect(await errors(fields, { qty: 10 })).toEqual([])
  })

  it('list sizes', async () => {
    const fields = { faq: f.repeater({ fields: { q: f.text() }, minItems: 1, maxItems: 2 }) }
    expect(await errors(fields, { faq: [{}, {}, {}] })).toEqual([{ path: 'faq', message: 'expected at most 2 items' }])
  })

  it('custom Standard Schema validator (server only)', async () => {
    const even = v.pipe(v.number(), v.check(n => n % 2 === 0, 'must be even'))
    const fields = { n: f.number({ validate: even }) }
    expect(await errors(fields, { n: 3 })).toEqual([{ path: 'n', message: 'must be even' }])
    expect(await errors(fields, { n: 4 })).toEqual([])
    // the descriptor's built-in rules still run first
    expect(await errors(fields, { n: 'x' })).toEqual([{ path: 'n', message: 'expected a number' }])
  })

  it('unique: asks the storage check, and only for non-empty values', async () => {
    const taken = new Set(['hello'])
    const asked: unknown[] = []
    const isUnique = async (field: string, value: unknown) => {
      asked.push([field, value])
      return !taken.has(value as string)
    }
    const fields = { slug: f.slug({ unique: true }) }
    expect(await errors(fields, { slug: 'hello' }, { isUnique })).toEqual([{ path: 'slug', message: 'already used by another entry' }])
    expect(await errors(fields, { slug: 'other' }, { isUnique })).toEqual([])
    expect(await errors(fields, {}, { isUnique })).toEqual([])
    expect(asked).toEqual([['slug', 'hello'], ['slug', 'other']])
    await expect(f.validateEntry(fields, { slug: 'x' })).rejects.toThrow('no isUnique check')
  })

  it('unique: caps text at 255 characters unless maxLength is set, as on MySQL', async () => {
    expect(await errors({ s: f.text({ unique: true }) }, { s: 'a'.repeat(256) }, { isUnique: alwaysUnique }))
      .toEqual([{ path: 's', message: 'expected at most 255 characters' }])
    expect(await errors({ s: f.text({ unique: true, maxLength: 300 }) }, { s: 'a'.repeat(256) }, { isUnique: alwaysUnique })).toEqual([])
    expect(await errors({ s: f.text() }, { s: 'a'.repeat(256) })).toEqual([])
  })
})

describe('structured field paths', () => {
  const fields = {
    title: f.text({ required: true }),
    address: f.object({ fields: { city: f.text({ required: true }), zip: f.text({ pattern: '\\d{5}' }) } }),
    faq: f.repeater({
      fields: {
        question: f.text({ required: true }),
        meta: f.object({ fields: { order: f.number({ integer: true }) } }),
      },
    }),
  }

  it('lists every failing nested object and repeater path', async () => {
    const data = {
      title: 'Ok',
      address: { zip: 'abc' },
      faq: [
        { question: 'Fine', meta: { order: 1 } },
        { question: '', meta: { order: 1.5 } },
        { question: 'Also fine', meta: { order: 'x' } },
      ],
    }
    expect(await errors(fields, data)).toEqual([
      { path: 'address.city', message: 'required' },
      { path: 'address.zip', message: 'expected to match \\d{5}' },
      { path: 'faq.1.question', message: 'required' },
      { path: 'faq.1.meta.order', message: 'expected a whole number' },
      { path: 'faq.2.meta.order', message: 'expected a number' },
    ])
  })

  it('reports unknown keys at their path', async () => {
    expect(await errors(fields, { title: 'Ok', faq: [{ question: 'Q', extra: 1 }] })).toEqual([
      { path: 'faq.0.extra', message: 'unknown field' },
    ])
  })

  it('returns the parsed value when valid', async () => {
    const result = await f.validateEntry(fields, { title: 'Ok' })
    expect(result).toEqual({ success: true, value: { title: 'Ok', address: undefined, faq: undefined } })
  })
})
