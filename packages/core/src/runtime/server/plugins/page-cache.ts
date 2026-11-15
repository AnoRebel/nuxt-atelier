// Keeps a rendered page the page-cache middleware let through as shareable: a full 200 HTML render that
// sets no cookie. Served from memory after that, until it's `cache.pages` seconds old or content changes.
import type { RequestEvent } from 'nuxt/server'
import type { CachedPage } from '../middleware/page-cache'
import { useServerHooks } from 'nuxt/server'
import { remember } from '../cache'

/** Whether the response sets a cookie (the hook's header record leaves `set-cookie` out): someone's own. */
function setsCookie(event: RequestEvent): boolean {
  const raw = event as unknown as { node?: { res?: { getHeader?: (name: string) => unknown } }, res?: { headers?: Headers } }
  return raw.node?.res?.getHeader ? raw.node.res.getHeader('set-cookie') !== undefined : !!raw.res?.headers?.has('set-cookie')
}

interface RenderResponse { body: unknown, statusCode?: number, status?: number, headers: Record<string, string | undefined> }

export default () => {
  ;(useServerHooks().hook as (name: 'render:response', fn: (response: RenderResponse, context: { event: RequestEvent }) => void) => void)('render:response', (response, { event }) => {
    const key = event.context.atelierPageCache as string | undefined
    const status = response.statusCode ?? response.status ?? 200
    const type = response.headers['content-type'] ?? ''
    if (!key || status !== 200 || typeof response.body !== 'string' || !type.startsWith('text/html') || setsCookie(event))
      return
    response.headers['x-atelier-cache'] = 'miss'
    remember(key, { status, type, body: response.body } satisfies CachedPage)
  })
}
