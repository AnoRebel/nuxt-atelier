// Rich text is stored as ProseMirror JSON (Tiptap's), never HTML. Saving it keeps only what a renderer can
// output safely: the nodes and marks below with their known attributes, plus a field's own `nodes` and
// `marks`. Anything else is removed before storage: unknown nodes (their text kept), unknown marks, `on…`
// attributes, and URLs with a scheme other than http(s), mailto and tel (no `javascript:`, no `data:`).

/** The attributes each node may keep. */
const NODES: Record<string, string[]> = {
  doc: [],
  paragraph: ['textAlign'],
  text: [],
  heading: ['level', 'textAlign'],
  bulletList: [],
  orderedList: ['start', 'type'],
  listItem: [],
  taskList: [],
  taskItem: ['checked'],
  blockquote: [],
  codeBlock: ['language'],
  hardBreak: [],
  horizontalRule: [],
  image: ['src', 'alt', 'title', 'width', 'height'],
  table: [],
  tableRow: [],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
}
/** The attributes each mark may keep. A link's `to`/`id` point at an entry (its `href` filled on read). */
const MARKS: Record<string, string[]> = {
  bold: [],
  italic: [],
  strike: [],
  underline: [],
  code: [],
  subscript: [],
  superscript: [],
  highlight: ['color'],
  link: ['href', 'target', 'rel', 'to', 'id'],
}
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'background'])
const SAFE_URL = /^(?:https?:|mailto:|tel:|[/#?.]|[^:/?#]*(?:[/?#]|$))/i

/** A URL a renderer may output: http(s), mailto, tel, or relative. Control characters and spaces can't hide a scheme. */
export function safeUrl(value: unknown): value is string {
  if (typeof value !== 'string')
    return false
  // browsers ignore these inside a scheme: `java\tscript:`, ` javascript:`
  const visible = [...value].filter(c => c.charCodeAt(0) > 0x20 && (c.charCodeAt(0) < 0x7F || c.charCodeAt(0) > 0x9F)).join('')
  return SAFE_URL.test(visible)
}

export interface RichTextAllowance {
  /** Custom node types (Tiptap extensions) kept with their attributes. */
  nodes?: readonly string[]
  /** Custom mark types kept with their attributes. */
  marks?: readonly string[]
}

type Json = Record<string, unknown>
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Attributes kept: the listed ones (all for a custom type), never `on…`, URLs only when safe. */
function attributes(attrs: unknown, allowed: string[] | undefined): Json | undefined {
  if (!isObject(attrs))
    return undefined
  const kept = Object.entries(attrs).filter(([key, value]) =>
    (allowed === undefined || allowed.includes(key)) && !/^on/i.test(key) && (!URL_ATTRIBUTES.has(key.toLowerCase()) || value === null || safeUrl(value)))
  return kept.length ? Object.fromEntries(kept) : undefined
}

/** The document with everything a renderer couldn't output safely removed. */
export function sanitizeRichText(doc: Json, allowance: RichTextAllowance = {}): Json {
  const node = (value: unknown): Json[] => {
    if (!isObject(value) || typeof value.type !== 'string')
      return []
    const custom = allowance.nodes?.includes(value.type)
    if (!(value.type in NODES) && !custom) // unknown: its content stays, without it
      return Array.isArray(value.content) ? value.content.flatMap(node) : []
    const out: Json = { type: value.type }
    const attrs = attributes(value.attrs, custom ? undefined : NODES[value.type])
    if (attrs)
      out.attrs = attrs
    if (value.type === 'text') {
      out.text = typeof value.text === 'string' ? value.text : ''
      const marks = Array.isArray(value.marks)
        ? value.marks.flatMap((mark) => {
            if (!isObject(mark) || typeof mark.type !== 'string')
              return []
            const customMark = allowance.marks?.includes(mark.type)
            if (!(mark.type in MARKS) && !customMark)
              return []
            const markAttrs = attributes(mark.attrs, customMark ? undefined : MARKS[mark.type])
            // a link whose href was removed links nowhere: drop it, unless it points at an entry
            if (mark.type === 'link' && !markAttrs?.href && !markAttrs?.to)
              return []
            return [{ type: mark.type, ...markAttrs ? { attrs: markAttrs } : {} }]
          })
        : []
      if (marks.length)
        out.marks = marks
    }
    if (Array.isArray(value.content))
      out.content = value.content.flatMap(node)
    return [out]
  }
  return node(doc)[0] ?? { type: 'doc' }
}
