// The app's own pages win over entries with the same URL (the catch-all ranks below them). This finds the
// page that hides an entry's URL, with vue-router's own matcher over the app's routes, so the admin can warn.
import type { RouteRecordRaw, RouterMatcher } from 'vue-router'
import { createRouterMatcher, START_LOCATION } from 'vue-router'
import { pages } from '#atelier-host-pages'

let matcher: RouterMatcher | undefined

/** The app page that serves `path` instead of the catch-all, by its route path (`/contact`, `/:id()`), if any. */
function shadowingPage(path: string): string | undefined {
  matcher ??= createRouterMatcher(pages as RouteRecordRaw[], {})
  const matched = matcher.resolve({ path }, START_LOCATION).matched
  return matched.at(-1)?.path
}

/** The entry's URLs that an app page hides, with that page: present only when there are some. */
export function shadowed(entry: { path?: string | null, paths?: Record<string, string> }): { shadowed?: { path: string, page: string }[] } {
  const urls = new Set([...entry.path ? [entry.path] : [], ...Object.values(entry.paths ?? {})])
  const hidden = [...urls].flatMap((path) => {
    const page = shadowingPage(decodeURI(path))
    return page ? [{ path, page }] : []
  })
  return hidden.length ? { shadowed: hidden } : {}
}
