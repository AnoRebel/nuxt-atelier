// What AI assist asks the model, and how its answers are read back. Pure functions, no provider here.

const RULES = 'Answer with the result only: no preamble, no quotes around it, no explanation.'

/** Whether `exclude` (`type`, or `type.field`) keeps this content type or field from the provider. */
export function excluded(exclude: readonly string[], type: string, field?: string): boolean {
  return exclude.includes(type) || (field !== undefined && exclude.includes(`${type}.${field}`))
}

/** Rewrite, shorten or expand a text. */
export function textPrompt(action: 'rewrite' | 'shorten' | 'expand', text: string, context: { label: string, locale?: string }) {
  const how = { rewrite: 'Rewrite it to read more clearly, keeping its meaning, tone and length.', shorten: 'Make it shorter, keeping what matters.', expand: 'Expand it with more detail, in the same voice, without inventing facts.' }[action]
  return {
    system: `You edit website copy. ${how} Keep its language${context.locale ? ` (${context.locale})` : ''}. ${RULES}`,
    prompt: `The "${context.label}" field:\n\n${text}`,
  }
}

const PROTECTED = new Set(['id', 'type', 'href', 'src', 'url', 'slug', 'to', 'ref', 'key'])

/** Translate a text, or a JSON value (rich text, a block) whose structure must come back unchanged. */
export function translatePrompt(value: unknown, to: string, from?: string) {
  const json = typeof value !== 'string'
  return {
    system: `You translate website content into ${to}${from ? ` from ${from}` : ''}. Keep meaning, tone and formatting. ${json
      ? `The content is JSON: answer with the same JSON, translating only human-readable text values; keep every key, and every value of ${[...PROTECTED].join(', ')} and every non-text value, as it is. Answer with the JSON only.`
      : RULES}`,
    prompt: json ? JSON.stringify(value) : String(value),
  }
}

/**
 * The translation of a JSON value, taken from the model's answer only where the original has a text that
 * may change: the structure, ids, types and links stay the original's whatever the model did.
 */
export function mergeTranslation<T>(original: T, answer: string): T {
  let translated: unknown
  try {
    translated = JSON.parse(answer.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  }
  catch {
    throw new Error('The model\'s translation wasn\'t JSON')
  }
  const walk = (a: unknown, b: unknown, key?: string): unknown => {
    if (typeof a === 'string')
      return typeof b === 'string' && !PROTECTED.has(key ?? '') ? b : a
    if (Array.isArray(a))
      return a.map((item, i) => walk(item, Array.isArray(b) ? b[i] : undefined))
    if (a && typeof a === 'object')
      return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, walk(v, b && typeof b === 'object' ? (b as Record<string, unknown>)[k] : undefined, k)]))
    return a
  }
  return walk(original, translated) as T
}

/** SEO title and description, from an entry's (allowed) text. */
export function seoPrompt(fields: Record<string, string>, locale?: string) {
  return {
    system: `You write search engine titles and descriptions${locale ? ` in ${locale}` : ''}: a title of at most 60 characters and a description of at most 155, accurate to the page, without clickbait. Answer with JSON only: {"title": "…", "description": "…"}.`,
    prompt: Object.entries(fields).map(([label, text]) => `${label}:\n${text}`).join('\n\n'),
  }
}

export function parseSeo(answer: string): { title: string, description: string } {
  const json = JSON.parse(answer.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { title?: unknown, description?: unknown }
  if (typeof json.title !== 'string' || typeof json.description !== 'string')
    throw new Error('The model\'s answer had no title and description')
  return { title: json.title.slice(0, 120), description: json.description.slice(0, 300) }
}

/** Alt text for an image (sent alongside). */
export function altPrompt(filename: string, locale?: string) {
  return {
    system: `You write alt text for images on websites${locale ? `, in ${locale}` : ''}: what the image shows that matters to someone who can't see it, in one sentence of at most 125 characters, without "image of". ${RULES}`,
    prompt: `The file is called "${filename}". Describe it.`,
  }
}

// --- the assistant: requests to the content API, proposed for the user to approve

export interface Proposal { method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, summary: string }
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE'])
const ALLOWED = /^\/api\/_atelier\/(?:collections|singletons|media)(?:\/[\w%-]+)*(?:\?[^\s#]*)?$/

/** What the assistant is told: what it may propose, and the content the user can see. */
export function assistantPrompt(request: string, types: { name: string, kind: 'collection' | 'singleton', fields: string[], actions: string[] }[]) {
  return {
    system: `You help an editor work with a CMS by proposing requests to its content API. You never act yourself: the editor reviews each request, and the ones they approve are sent with their own permissions.

The API (JSON):
- GET /api/_atelier/collections/<type>?filter=<json>&sort=<json>&limit=<n>: list entries
- GET /api/_atelier/collections/<type>/<id>?draft=true: one entry
- POST /api/_atelier/collections/<type> {"data": {…}, "publish"?: true}: create
- PATCH /api/_atelier/collections/<type>/<id> {"version": <the version read>, "data": {…changed fields}}: update
- POST /api/_atelier/collections/<type>/<id>/publish {"version": n}, POST …/unpublish
- DELETE /api/_atelier/collections/<type>/<id>
- GET and PATCH /api/_atelier/singletons/<name> {"version", "data"}
Filters: {"field": {"eq"|"ne"|"gt"|"lt"|"contains"|"in": value}}.

The content types (and what this editor may do with each):
${types.map(t => `- ${t.kind} "${t.name}": fields ${t.fields.join(', ')}; may ${t.actions.join(', ') || 'nothing'}`).join('\n')}

Answer with JSON only: [{"method": "…", "path": "…", "body": …, "summary": "what this does, in a sentence"}]. Propose reads first when you need ids or versions you don't know; never invent them. An empty list when you can't help.`,
    prompt: request,
  }
}

/** The proposals in the model's answer that are content API requests; anything else is dropped. */
export function parseProposals(answer: string): Proposal[] {
  let list: unknown
  try {
    list = JSON.parse(answer.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  }
  catch {
    return []
  }
  if (!Array.isArray(list))
    return []
  return list.flatMap((item) => {
    const p = item as Partial<Proposal>
    const method = String(p.method ?? '').toUpperCase()
    if (!METHODS.has(method) || typeof p.path !== 'string' || !ALLOWED.test(p.path) || p.path.includes('..'))
      return []
    return [{ method: method as Proposal['method'], path: p.path, ...p.body === undefined || method === 'GET' || method === 'DELETE' ? {} : { body: p.body }, summary: String(p.summary ?? `${method} ${p.path}`).slice(0, 300) }]
  }).slice(0, 20)
}
