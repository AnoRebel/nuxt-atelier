// Redirects: a source path or pattern, a target, a status. Sources are canonical paths (see canonicalPath)
// whose segments may be `:name` (one segment) and, last, `*` (the rest, one or more segments); the target
// may use the same names. A Location is a site path or an absolute http(s) URL an administrator entered,
// never protocol-relative (`//host`), whatever a request's path holds.
import { canonicalPath } from './routes'

export const REDIRECT_STATUSES = [301, 302, 307, 308] as const

export interface Redirect {
  id: string
  source: string
  target: string
  status: (typeof REDIRECT_STATUSES)[number]
  /** Created by Atelier when an entry's URL changed. */
  auto: boolean
}

const PARAM = /^:([a-z]\w*)$/i
const RESERVED = /^\/(?:api|_nuxt|_ipx|__nuxt[\w-]*|_)(?:\/|$)/
const isPattern = (source: string) => source.split('/').some(s => s === '*' || PARAM.test(s))

/** A site-relative target that stays on the site: one leading "/" and nothing a browser reads as a host. */
const isSitePath = (target: string) => /^\/(?![/\\])/.test(target) && !/[\s\\]/.test(target)
const isAbsolute = (target: string) => {
  try {
    const url = new URL(target)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !/[\s\\]/.test(target)
  }
  catch {
    return false
  }
}

/** The problem with a source, or undefined when it's valid. */
export function sourceProblem(source: string): string | undefined {
  // literal segments must be canonical; :name and * stand for segments
  const literal = source.split('/').map(s => s === '*' || PARAM.test(s) ? 'x' : s).join('/')
  if (!source.startsWith('/') || source.startsWith('//') || canonicalPath(literal) !== literal)
    return 'Use a path like /old-page or /blog/:slug: one leading "/", no trailing "/", percent-encoded'
  if (RESERVED.test(source))
    return 'Paths under /api, /_nuxt and /_… are served by the app itself'
  const segments = source.split('/').slice(1)
  if (segments.some((s, i) => s === '*' && i !== segments.length - 1))
    return '* may only be the last segment'
  const names = segments.flatMap(s => PARAM.exec(s)?.[1] ?? [])
  if (new Set(names).size !== names.length)
    return 'Each :name may appear once'
}

/** The problem with a target for this source, or undefined when it's valid. */
export function targetProblem(source: string, target: string): string | undefined {
  if (!isSitePath(target) && !isAbsolute(target))
    return 'Use a path on this site like /new-page, or a full http(s):// URL'
  if (isAbsolute(target) && /[:*]/.test(new URL(target).host))
    return 'A full URL\'s host can\'t use :name or *'
  if (target.length > 2048)
    return 'At most 2048 characters'
  const names = new Set(source.split('/').flatMap(s => PARAM.exec(s)?.[1] ?? (s === '*' ? '*' : [])))
  for (const [, name] of target.matchAll(/:([a-z]\w*)/gi)) {
    if (isSitePath(target) && !names.has(name!))
      return `:${name} isn't in the source`
  }
  if (target.includes('*') && !names.has('*'))
    return '* isn\'t in the source'
}

/** The values a source's `:name`s and `*` take for a path, or undefined when it doesn't match. */
function match(source: string, path: string): Record<string, string> | undefined {
  if (!isPattern(source))
    return source === path ? {} : undefined
  const want = source.split('/').slice(1)
  const have = path.split('/').slice(1)
  const values: Record<string, string> = {}
  for (const [i, segment] of want.entries()) {
    if (segment === '*') {
      if (have.length <= i)
        return undefined
      values['*'] = have.slice(i).join('/')
      return values
    }
    if (have[i] === undefined)
      return undefined
    const name = PARAM.exec(segment)?.[1]
    if (name)
      values[name] = have[i]!
    else if (segment !== have[i])
      return undefined
  }
  return want.length === have.length ? values : undefined
}

/**
 * The redirect for a canonical path and where it sends it, or undefined. An exact source wins over a
 * pattern; patterns are tried in order. A Location that would leave the site by accident (`//host`, `/\host`)
 * is never returned.
 */
export function findRedirect(redirects: Redirect[], path: string): { redirect: Redirect, location: string } | undefined {
  const exact = redirects.find(r => r.source === path)
  const candidates = exact ? [exact] : redirects.filter(r => isPattern(r.source))
  for (const redirect of candidates) {
    const values = match(redirect.source, path)
    if (!values)
      continue
    const location = redirect.target.replace(/:([a-z]\w*)|\*/gi, (token, name: string | undefined) => values[name ?? '*'] ?? token)
    // an absolute target keeps its own origin: a request's values only ever fill its path
    if (isSitePath(location) || (isAbsolute(redirect.target) && isAbsolute(location) && new URL(location).origin === new URL(redirect.target).origin))
      return { redirect, location }
  }
}

/** A path a source matches, to follow a chain from: its names and `*` filled with "x". */
const sample = (source: string) => source.split('/').map(s => s === '*' || PARAM.test(s) ? 'x' : s).join('/')

/**
 * The chain of paths `candidate` would start a loop on, like ['/a', '/b', '/a'], or undefined.
 * Follows site paths only: an absolute target ends a chain.
 */
export function redirectLoop(redirects: Redirect[], candidate: Redirect): string[] | undefined {
  const all = [...redirects.filter(r => r.id !== candidate.id), candidate]
  const chain = [sample(candidate.source)]
  for (let hop = 0; hop < 20; hop++) {
    const next = findRedirect(all, chain.at(-1)!)
    if (!next || !isSitePath(next.location))
      return undefined
    const path = canonicalPath(next.location.split(/[?#]/)[0]!) ?? next.location
    chain.push(path)
    if (chain.indexOf(path) !== chain.length - 1)
      return chain
  }
  return chain // too long to be anything but a loop
}
