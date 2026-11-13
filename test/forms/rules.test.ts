// Form definitions and submission rules (shared by the browser and the server), and Turnstile verification.
import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import { definitionErrors, fileProblem, submissionSchema } from '../../packages/core/src/runtime/shared/forms'
import { turnstileChallenge } from '../../packages/core/src/runtime/server/forms'

const field = (name: string, type: string, extra: object = {}) => ({ name, type, label: name, ...extra }) as never

describe('form definitions', () => {
  it('accepts a contact form', () => {
    expect(definitionErrors({ fields: [field('name', 'text', { required: true }), field('email', 'email', { required: true }), field('topic', 'select', { options: 'sales|Sales\nsupport' })] })).toEqual([])
  })

  it('names what\'s wrong: names, options, ranges, patterns, redirects', () => {
    const errors = definitionErrors({
      fields: [field('name', 'text'), field('name', 'text'), field('_token', 'text'), field('topic', 'select'), field('age', 'number', { min: 9, max: 1 }), field('code', 'text', { pattern: '(' })],
      success: { redirect: 'javascript:alert(1)' },
    })
    expect(errors.map(e => e.path)).toEqual(['fields.1.name', 'fields.2.name', 'fields.3.options', 'fields.4.max', 'fields.5.pattern', 'success.redirect'])
    expect(definitionErrors({ fields: [] })).toEqual([{ path: 'fields', message: 'add at least one field' }])
  })
})

describe('submission rules', () => {
  const schema = submissionSchema({ fields: [
    field('name', 'text', { required: true, max: 10 }),
    field('email', 'email', { required: true }),
    field('age', 'number', { min: 18 }),
    field('topic', 'radio', { options: 'a\nb' }),
    field('agree', 'consent', { required: true }),
    field('code', 'text', { pattern: '[A-Z]{3}' }),
  ] })
  const errors = (values: object) => {
    const result = v.safeParse(schema, values)
    return result.success ? [] : result.issues.map(i => v.getDotPath(i))
  }

  it('passes a good submission, dropping unknown keys', () => {
    const result = v.safeParse(schema, { name: ' Ada ', email: 'ada@example.com', age: '36', topic: 'b', agree: true, code: '', extra: 'x' })
    expect(result.success && result.output).toEqual({ name: 'Ada', email: 'ada@example.com', age: 36, topic: 'b', agree: true, code: '' })
  })

  it('fails each broken rule on its field', () => {
    expect(errors({ name: '', email: 'nope', age: 12, topic: 'c', agree: false, code: 'abc' })).toEqual(['name', 'email', 'age', 'topic', 'agree', 'code'])
    expect(errors({ name: 'x'.repeat(11), email: 'a@b.co', agree: true })).toEqual(['name'])
  })

  it('checks a file\'s type and size', () => {
    const cv = field('cv', 'file', { accept: 'application/pdf, .docx', maxSize: 1 })
    expect(fileProblem(cv, { name: 'cv.pdf', type: 'application/pdf', size: 1000 })).toBeUndefined()
    expect(fileProblem(cv, { name: 'cv.docx', type: '', size: 1000 })).toBeUndefined()
    expect(fileProblem(cv, { name: 'cv.exe', type: 'application/x-msdownload', size: 1000 })).toMatch(/expected/)
    expect(fileProblem(cv, { name: 'cv.pdf', type: 'application/pdf', size: 2 * 1024 * 1024 })).toMatch(/larger than 1 MB/)
  })
})

describe('turnstile', () => {
  it('posts the token, the secret and the IP, and trusts only success: true', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify({ success: (init.body as URLSearchParams).get('response') === 'good' })))
    const turnstile = turnstileChallenge({ siteKey: 'site', secret: 'shh', fetch: fetch as never, endpoint: 'https://verify.test/siteverify' })
    expect(await turnstile.verify('good', '203.0.113.9')).toBe(true)
    expect(await turnstile.verify('forged', '203.0.113.9')).toBe(false)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://verify.test/siteverify')
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: 'shh', response: 'good', remoteip: '203.0.113.9' })
  })
})
