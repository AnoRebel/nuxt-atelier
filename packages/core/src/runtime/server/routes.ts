// URL paths of routable entries: checking route patterns when the schema loads, and turning an entry's
// data into its paths. Paths are stored canonical (each segment percent-encoded the same way), so a
// request path is looked up after canonicalPath().
import type { Field } from '../shared/fields'
import type { RouteDefinition } from './types'

/** Longest stored path, the `atelier_routes.path` column. */
export const MAX_PATH = 255

const PLACEHOLDER = /\{([a-z][a-z0-9]*)\}/gi
const LITERAL = /^[\w.~-]*$/ // unreserved URL characters: nothing to encode
const LOCALE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i
// served by Nuxt and Nitro themselves, never by the catch-all
const RESERVED = /^\/(?:api|_nuxt|_ipx|__nuxt[\w-]*|_)(?:\/|$)/
const PATH_FIELD_TYPES = new Set<Field['type']>(['text', 'slug', 'number', 'select', 'date'])

/** One URL of an entry. `locale` is '' for a pattern shared by every locale. */
export interface EntryPath { locale: string, path: string }

/** The patterns of a route, by locale ('' for one shared by every locale). */
export function patterns(route: RouteDefinition): [locale: string, pattern: string][] {
  return typeof route.pattern === 'string' ? [['', route.pattern]] : Object.entries(route.pattern)
}

/** Throws a schema error unless every pattern is valid and its placeholders are required top-level fields. */
export function checkRoute(owner: string, route: RouteDefinition, fields: Record<string, Field>, singleton = false): void {
  const fail = (message: string) => {
    throw new Error(`[nuxt-atelier] ${owner}: ${message}`)
  }
  const list = patterns(route)
  if (!list.length)
    fail('route.pattern has no locales; give a pattern like "/blog/{slug}", or one per locale')
  for (const [locale, pattern] of list) {
    const where = locale ? `route.pattern.${locale}` : 'route.pattern'
    if (locale && !LOCALE.test(locale))
      fail(`${where}: "${locale}" isn't a locale code like "en" or "pt-br"`)
    if (typeof pattern !== 'string' || !pattern.startsWith('/') || (pattern !== '/' && (pattern.endsWith('/') || pattern.includes('//'))))
      fail(`${where} "${pattern}" must start with "/", without "//" or a trailing "/"`)
    if (RESERVED.test(pattern))
      fail(`${where} "${pattern}" is under a path Nuxt serves itself (/api, /_nuxt, /_…)`)
    for (const segment of pattern.split('/').slice(1)) {
      if (!LITERAL.test(segment.replace(PLACEHOLDER, '')))
        fail(`${where} "${pattern}": "${segment}" may only hold letters, digits, "-", "_", ".", "~" and {field} placeholders`)
    }
    for (const [, key] of pattern.matchAll(PLACEHOLDER)) {
      const field = fields[key!]
      if (!field || !PATH_FIELD_TYPES.has(field.type) || !field.required || (field.type === 'date' && field.mode && field.mode !== 'date'))
        fail(`${where} "${pattern}": {${key}} must be a required top-level ${[...PATH_FIELD_TYPES].join(', ')} field (dates in "date" mode)`)
    }
  }
  if (route.parent !== undefined) {
    const field = fields[route.parent]
    if (singleton)
      fail('route.parent: a singleton has no parent; only collections can nest URLs')
    if (field?.type !== 'relation' || field.to !== owner || field.many)
      fail(`route.parent "${route.parent}" must be a top-level relation to "${owner}" holding one entry`)
  }
}

/** The path of each pattern for this data; a pattern whose field is empty gives none. */
export function entryPaths(route: RouteDefinition | undefined, data: Record<string, unknown>): EntryPath[] {
  if (!route)
    return []
  return patterns(route).flatMap(([locale, pattern]) => {
    let empty = false
    const path = pattern.replace(PLACEHOLDER, (_, key: string) => {
      const value = data[key]
      if (value === null || value === undefined || value === '')
        empty = true
      return encodeURIComponent(String(value ?? ''))
    })
    return empty ? [] : [{ locale, path }]
  })
}

/**
 * The stored form of a request path: each segment decoded, then encoded the same way entry paths are,
 * without a trailing "/". Undefined for a path no entry can have: not starting with a single "/" (so
 * `//host` never resolves), malformed encoding, or too long.
 */
export function canonicalPath(path: string): string | undefined {
  if (!path.startsWith('/') || path.startsWith('//'))
    return undefined
  try {
    const canonical = path.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/').replace(/(.)\/$/, '$1')
    return canonical.length > MAX_PATH ? undefined : canonical
  }
  catch {
    return undefined
  }
}

/** The path for an entry read in `locale` (the first pattern's when omitted), and every locale's. */
export function presentPaths(route: RouteDefinition, stored: EntryPath[], locale?: string): { path: string | null, paths?: Record<string, string> } {
  const shared = stored.find(p => p.locale === '')
  if (typeof route.pattern === 'string')
    return { path: shared?.path ?? null }
  const paths = Object.fromEntries(stored.map(p => [p.locale, p.path]))
  const wanted = locale ?? patterns(route)[0]![0]
  return { path: paths[wanted] ?? null, paths }
}
