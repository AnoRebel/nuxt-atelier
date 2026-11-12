import { describe, expect, it } from 'vitest'
import { appSecretProblem } from '../../packages/core/src/runtime/server/secret-check'
import * as f from '../../packages/core/src/runtime/shared/fields'
import { safeUrl, sanitizeRichText } from '../../packages/core/src/runtime/shared/rich-text'

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...marks ? { marks } : {} })

describe('rich text is stored safe', () => {
  it('removes script-like nodes, event handlers and javascript: links before storage', async () => {
    const stored = await f.validateEntry({ body: f.richText() }, {
      body: doc(
        { type: 'paragraph', attrs: { onclick: 'alert(1)', textAlign: 'left' }, content: [text('Hi', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'bold' }])] },
        { type: 'htmlBlock', attrs: { html: '<script>alert(1)</script>' }, content: [{ type: 'paragraph', content: [text('kept text')] }] },
        { type: 'image', attrs: { src: ' java\tscript:alert(1)', alt: 'x', onerror: 'alert(1)' } },
        { type: 'paragraph', content: [text('ok', [{ type: 'link', attrs: { href: 'https://example.com', onmouseover: 'x' } }, { type: 'evil' }])] },
      ),
    })
    expect(stored.success).toBe(true)
    expect(stored.success && stored.value.body).toEqual(doc(
      { type: 'paragraph', attrs: { textAlign: 'left' }, content: [text('Hi', [{ type: 'bold' }])] },
      { type: 'paragraph', content: [text('kept text')] },
      { type: 'image', attrs: { alt: 'x' } },
      { type: 'paragraph', content: [text('ok', [{ type: 'link', attrs: { href: 'https://example.com' } }])] },
    ))
    expect(JSON.stringify(stored.success && stored.value)).not.toMatch(/script|onclick|onerror|onmouseover|alert/i)
  })

  it('keeps a field\'s own nodes and marks, still without handlers or unsafe URLs', () => {
    expect(sanitizeRichText(doc({ type: 'callout', attrs: { tone: 'warn', onclick: 'x', href: 'data:text/html,x' } }), { nodes: ['callout'] }))
      .toEqual(doc({ type: 'callout', attrs: { tone: 'warn' } }))
  })

  it('accepts only http(s), mailto, tel and relative URLs', () => {
    for (const url of ['https://a.b', 'http://a.b', 'mailto:a@b.c', 'tel:+255', '/about', '#top', '?q=1', 'page', './x', 'a/b:c'])
      expect(safeUrl(url), url).toBe(true)
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:x', ' javascript:x', 'java\nscript:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd'])
      expect(safeUrl(url), url).toBe(false)
  })
})

describe('the app secret', () => {
  it('must be set, and long enough, in production', () => {
    expect(appSecretProblem(undefined)).toMatch(/isn't set/)
    expect(appSecretProblem('')).toMatch(/isn't set/)
    expect(appSecretProblem('short')).toMatch(/5 characters; it needs at least 32/)
    expect(appSecretProblem('a-test-secret-that-is-long-enough-123456')).toBeUndefined()
  })
})
