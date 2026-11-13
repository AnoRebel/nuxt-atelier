// Rich text (ProseMirror JSON) to Vue nodes, on the server and in the browser alike. Only the allowlisted
// nodes and marks become elements (shared/rich-text.ts keeps nothing else on save; this checks again), URLs
// are checked again, and the app maps its own nodes and marks, or any of these, to its own components.
import type { Component, VNode, VNodeChild } from 'vue'
import { h } from 'vue'
import { safeUrl } from './rich-text'

type Json = Record<string, unknown>
export interface RichTextNode { type: string, attrs?: Json, content?: RichTextNode[], text?: string, marks?: { type: string, attrs?: Json }[] }

export interface RenderOptions {
  /**
   * Components for node or mark types, by type name: the app's own (`callout`) or replacing ours (`link`,
   * `image`). They get `node` (or `mark`) as a prop and the content as their default slot.
   */
  components?: Record<string, Component>
  /** The component for links to paths on the site (`NuxtLink`); plain <a> otherwise. */
  link?: Component
}

const attr = (attrs: Json | undefined, key: string) => attrs?.[key]
const str = (value: unknown) => typeof value === 'string' ? value : undefined
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const ALIGN = new Set(['left', 'center', 'right', 'justify'])
const align = (attrs: Json | undefined) => {
  const value = str(attr(attrs, 'textAlign'))
  return value && ALIGN.has(value) && value !== 'left' ? { style: { textAlign: value } } : {}
}
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined
const cell = (attrs: Json | undefined) => ({ colspan: num(attr(attrs, 'colspan')), rowspan: num(attr(attrs, 'rowspan')) })

/** The element for a node of a known type, with `children` inside; undefined for unknown types. */
function element(node: RichTextNode, children: VNodeChild[]): VNode | undefined {
  const a = node.attrs
  switch (node.type) {
    case 'paragraph': return h('p', align(a), children)
    case 'heading': {
      const level = Math.min(6, Math.max(1, num(attr(a, 'level')) ?? 2))
      return h(`h${level}`, align(a), children)
    }
    case 'bulletList': return h('ul', children)
    case 'orderedList': return h('ol', { start: num(attr(a, 'start')) }, children)
    case 'listItem': return h('li', children)
    case 'taskList': return h('ul', { 'data-type': 'taskList' }, children)
    case 'taskItem': return h('li', { 'data-type': 'taskItem', 'data-checked': String(attr(a, 'checked') === true) }, [
      h('input', { 'type': 'checkbox', 'checked': attr(a, 'checked') === true, 'disabled': true, 'aria-hidden': 'true' }),
      h('div', children),
    ])
    case 'blockquote': return h('blockquote', children)
    case 'codeBlock': {
      const language = str(attr(a, 'language'))
      return h('pre', [h('code', language && /^[\w+#-]+$/.test(language) ? { class: `language-${language}` } : {}, children)])
    }
    case 'hardBreak': return h('br')
    case 'horizontalRule': return h('hr')
    case 'image': {
      const src = attr(a, 'src')
      return safeUrl(src) ? h('img', { src, alt: str(attr(a, 'alt')) ?? '', title: str(attr(a, 'title')), width: num(attr(a, 'width')), height: num(attr(a, 'height')), loading: 'lazy' }) : undefined
    }
    case 'table': return h('table', [h('tbody', children)])
    case 'tableRow': return h('tr', children)
    case 'tableHeader': return h('th', cell(a), children)
    case 'tableCell': return h('td', cell(a), children)
    default: return undefined
  }
}

function markElement(mark: { type: string, attrs?: Json }, inner: VNodeChild, options: RenderOptions): VNodeChild {
  const own = options.components?.[mark.type]
  if (own)
    return h(own, { mark }, { default: () => inner })
  const a = mark.attrs
  switch (mark.type) {
    case 'bold': return h('strong', [inner])
    case 'italic': return h('em', [inner])
    case 'strike': return h('s', [inner])
    case 'underline': return h('u', [inner])
    case 'code': return h('code', [inner])
    case 'subscript': return h('sub', [inner])
    case 'superscript': return h('sup', [inner])
    case 'highlight': return h('mark', color(attr(a, 'color')) ? { style: { backgroundColor: color(attr(a, 'color')) } } : {}, [inner])
    case 'link': {
      const href = attr(a, 'href')
      if (!safeUrl(href))
        return inner
      // a path on the site: through the app's router
      if (options.link && href.startsWith('/') && !href.startsWith('//'))
        return h(options.link, { to: href }, { default: () => inner })
      const blank = attr(a, 'target') === '_blank'
      return h('a', { href, ...blank ? { target: '_blank', rel: 'noopener noreferrer' } : {} }, [inner])
    }
    default: return inner // an unknown mark: just its text
  }
}

/** The Vue nodes for a rich-text document (or any node of one). */
export function renderRichText(doc: RichTextNode | null | undefined, options: RenderOptions = {}): VNodeChild[] {
  // each node's output, flattened: an unknown node (or the doc) is its content, without an element
  const nodes = (n: RichTextNode): VNodeChild[] => {
    if (!n || typeof n.type !== 'string')
      return []
    if (n.type === 'text')
      return [(n.marks ?? []).reduceRight<VNodeChild>((inner, mark) => markElement(mark, inner, options), typeof n.text === 'string' ? n.text : '')]
    const children = Array.isArray(n.content) ? n.content.flatMap(nodes) : []
    const own = options.components?.[n.type]
    if (own)
      return [h(own, { node: n }, { default: () => children })]
    const el = n.type === 'doc' ? undefined : element(n, children)
    return el ? [el] : n.type === 'image' ? [] : children
  }
  return doc ? nodes(doc) : []
}
