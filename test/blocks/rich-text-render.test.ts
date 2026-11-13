import { describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { renderRichText } from '../../packages/core/src/runtime/shared/rich-text-render'

const render = (doc: object, options = {}) => renderToString(createSSRApp({ render: () => h('div', renderRichText(doc as never, options)) }))
const text = (t: string, marks?: object[]) => ({ type: 'text', text: t, ...marks ? { marks } : {} })

describe('rich text rendering', () => {
  it('renders the allowlisted nodes and marks', async () => {
    const html = await render({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('Title')] },
      { type: 'paragraph', content: [text('Hello '), text('world', [{ type: 'bold' }, { type: 'italic' }]), { type: 'hardBreak' }, text('x', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }])] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] }] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('let a = 1 < 2')] },
    ] })
    expect(html).toBe('<div><h2 style="text-align:center;">Title</h2><p>Hello <strong><em>world</em></strong><br><a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a></p><ul><li><p>one</p></li></ul><pre><code class="language-ts">let a = 1 &lt; 2</code></pre></div>')
  })

  it('never outputs what wasn\'t allowed: unknown nodes keep only their text, unsafe URLs are dropped', async () => {
    const html = await render({ type: 'doc', content: [
      { type: 'script', content: [text('alert(1)')] },
      { type: 'paragraph', attrs: { onclick: 'x()', textAlign: 'expression(x)' }, content: [text('<b>hi</b>', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'evil' }])] },
      { type: 'image', attrs: { src: 'data:text/html;base64,PHNjcmlwdD4=', alt: 'x' } },
      { type: 'heading', attrs: { level: '7"><script>' }, content: [text('h')] },
    ] })
    expect(html).toBe('<div>alert(1)<p>&lt;b&gt;hi&lt;/b&gt;</p><h2>h</h2></div>')
  })

  it('maps links to the site through the router\'s link, and node types to the app\'s components', async () => {
    const Link = defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h('a', { 'href': p.to, 'data-router': '' }, slots.default?.()) })
    const Callout = defineComponent({ props: { node: Object }, setup: (_, { slots }) => () => h('aside', slots.default?.()) })
    const html = await render({ type: 'doc', content: [
      { type: 'paragraph', content: [text('about', [{ type: 'link', attrs: { href: '/about' } }])] },
      { type: 'callout', content: [{ type: 'paragraph', content: [text('Note')] }] },
    ] }, { link: Link, components: { callout: Callout } })
    expect(html).toBe('<div><p><a href="/about" data-router>about</a></p><aside><p>Note</p></aside></div>')
  })
})
