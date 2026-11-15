// The admin's content security policy, in production: scripts only from the site and the inline ones this
// very page carries (Nuxt's config and import map), by hash, so an injected script can't run. Styles may be
// inline: the admin's are injected into its shadow root. Images and video may come from any https origin
// (media on object storage or a CDN). Frames: the visual editor's preview of the site, nothing else.
import type { RequestEvent } from 'nuxt/server'
import { createHash } from 'node:crypto'
import { useRuntimeConfig, useServerHooks } from 'nuxt/server'

interface RenderHtml { head: string[], bodyPrepend: string[], body: string[], bodyAppend: string[] }
type RawEvent = { path?: string, node?: { res?: { setHeader?: (name: string, value: string) => void } }, res?: { headers?: Headers } }

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

/** The hashes of the inline scripts the browser runs (not those with a src, not JSON data). */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>()
  for (const [, attributes = '', content = ''] of html.matchAll(SCRIPT)) {
    if (/\ssrc\s*=/i.test(attributes) || /\stype\s*=\s*["']?application\/(?:ld\+)?json/i.test(attributes))
      continue
    hashes.add(`'sha256-${createHash('sha256').update(content).digest('base64')}'`)
  }
  return [...hashes]
}

export function adminPolicy(hashes: string[]): string {
  return [
    `default-src 'self'`,
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `frame-src 'self'`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `form-action 'self'`,
  ].join('; ')
}

export default () => {
  const base = (useRuntimeConfig().public.atelier as { admin?: { base?: string } }).admin?.base ?? '/admin'
  ;(useServerHooks().hook as (name: 'render:html', fn: (html: RenderHtml, context: { event: RequestEvent }) => void) => void)('render:html', (html, { event }) => {
    const raw = event as unknown as RawEvent
    const path = (raw.path ?? '').split('?')[0]!
    if (path !== base && !path.startsWith(`${base}/`))
      return
    const policy = adminPolicy(inlineScriptHashes([...html.head, ...html.bodyPrepend, ...html.body, ...html.bodyAppend].join('')))
    if (raw.node?.res?.setHeader)
      raw.node.res.setHeader('content-security-policy', policy)
    else
      raw.res?.headers?.set('content-security-policy', policy)
  })
}
