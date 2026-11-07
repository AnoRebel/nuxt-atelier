// Fixed-window counters in the database, so every server instance (and Workers) shares them.
import type { RequestEvent } from 'nuxt/server'
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import { eq, lt } from 'drizzle-orm'
import { createError, getRequestIP } from 'nuxt/server'
import { buildTables } from '../db/tables'

export interface Limit {
  /** What's counted, e.g. `sign-in:<ip>:<email>`. Hashed before it's stored. */
  key: string
  max: number
  /** Seconds. */
  window: number
}

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('')

/** The client's IP: the socket's, or with `trustProxy` the first `X-Forwarded-For` address. */
export const clientIp = (event: RequestEvent, trustProxy: boolean) =>
  getRequestIP(event, { xForwardedFor: trustProxy }) ?? 'unknown'

export function createRateLimiter(driver: AtelierDriver) {
  const { atelier_rate_limits: table } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db

  const current = async (key: string) => {
    const [row] = await db.select().from(table).where(eq(table.key, key)).limit(1)
    return row && row.resetAt > new Date().toISOString() ? row as { count: number, resetAt: string } : undefined
  }

  return {
    /** Throws a 429 with `Retry-After` when any of the limits is used up. */
    async check(event: RequestEvent, limits: Limit[]): Promise<void> {
      for (const limit of limits) {
        const row = await current(await sha256(limit.key))
        if (row && row.count >= limit.max) {
          const seconds = Math.max(1, Math.ceil((Date.parse(row.resetAt) - Date.now()) / 1000))
          event.res.headers.set('retry-after', String(seconds))
          throw createError({ status: 429, message: `Too many attempts: try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}` })
        }
      }
    },

    /** Counts one attempt against each limit. */
    async hit(limits: Limit[]): Promise<void> {
      const now = new Date()
      // ponytail: read-then-write, so concurrent attempts can undercount by a few; an atomic upsert per dialect would be exact
      await db.delete(table).where(lt(table.resetAt, now.toISOString()))
      for (const limit of limits) {
        const key = await sha256(limit.key)
        const row = await current(key)
        const increment = () => db.update(table).set({ count: (row?.count ?? 1) + 1 }).where(eq(table.key, key))
        if (row)
          await increment()
        else // another request may have inserted it meanwhile
          await db.insert(table).values({ key, count: 1, resetAt: new Date(now.getTime() + limit.window * 1000).toISOString() }).catch(increment)
      }
    },

    /** Clears the counters, e.g. after a successful sign-in. */
    async reset(limits: Limit[]): Promise<void> {
      for (const limit of limits)
        await db.delete(table).where(eq(table.key, await sha256(limit.key)))
    },
  }
}
