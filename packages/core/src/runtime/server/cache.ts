// What the site serves, cached in memory for visitors, and the signal that it changed.
//
// Any content write clears the cache: a page shows related entries and links to others, so one change
// can touch any page. Apps hook `atelier:content:changed` to purge their own caches or a CDN.
import type { LifecycleHook, LifecycleHooks } from './db/store'
import type { SiteContext } from './sites'
import { useServerHooks } from 'nuxt/server'
import { inDemoSession } from './demo/sessions'
import { useAtelierServerConfig } from './index'
import { logger } from './logger'

/** A committed content write. `live` when what the site serves changed (a publish, or a save that publishes). */
export interface ContentChange {
  type: string
  /** The entry id, or a singleton's name. */
  id: string
  action: 'saved' | 'published' | 'unpublished' | 'deleted'
  live: boolean
}

// every hook also gets the site the operation is on (see sites.ts)
type Hooked = { [H in LifecycleHook as `atelier:${H}`]: (context: LifecycleHooks[H] & { site: SiteContext }) => void | Promise<void> }

declare module 'nuxt/schema' {
  interface NuxtServerHooks extends Hooked {
    /** After a content write commits. Errors are logged, never thrown to the writer. */
    'atelier:content:changed': (change: ContentChange) => void | Promise<void>
  }
}

// ponytail: per instance. Another instance's write shows here within MAX_AGE, not at once; a shared
// store (Redis, the database) would make it immediate everywhere.
const MAX_AGE = 30_000
let generation = 0
const cache = new Map<string, { generation: number, at: number, value: unknown }>()

const capacity = () => (useAtelierServerConfig() as unknown as { limits: { cacheSize: number } }).limits.cacheSize

/** A cached value, while nothing changed and it's fresh (`maxAge` ms). */
export function cached<T>(key: string, maxAge = MAX_AGE): T | undefined {
  if (inDemoSession()) // a demo visitor reads their own copy, never what others' requests cached
    return undefined
  const hit = cache.get(key)
  if (!hit)
    return undefined
  cache.delete(key)
  if (hit.generation !== generation || Date.now() - hit.at > maxAge)
    return undefined
  cache.set(key, hit) // most recently used last
  return hit.value as T
}

/** Caches a value, dropping the least recently used beyond `limits.cacheSize` (0 caches nothing). */
export function remember(key: string, value: unknown): void {
  if (inDemoSession()) // ...nor fills it with their copy's content
    return
  const size = capacity()
  if (size <= 0)
    return
  cache.delete(key)
  cache.set(key, { generation, at: Date.now(), value })
  while (cache.size > size)
    cache.delete(cache.keys().next().value!)
}

/** Clears the cache: after a write, or a change to what visitors may read (the public role). */
export function forgetCached(): void {
  generation++
  cache.clear()
}

/** After a write commits: clears the cache and tells the app's hooks. */
export async function contentChanged(change: ContentChange): Promise<void> {
  forgetCached()
  try {
    await useServerHooks().callHook('atelier:content:changed', change)
  }
  catch (error) {
    logger.error('An atelier:content:changed hook failed', { error })
  }
}
