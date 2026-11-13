// API tokens for headless clients: `Authorization: Bearer atk_…`. Stored as a SHA-256 hash (the token
// itself is shown once), with their own content permissions, an optional expiry, and revocable.
import type { ContentPermission } from '../../shared/policy'
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { SiteContext } from '../sites'
import { buildTables } from '../db/tables'
import { singleSite } from '../sites'

const TOKEN_PREFIX = 'atk_'
export const READ_ONLY: Record<string, ContentPermission> = { '*': { actions: ['read'] } }

const encoder = new TextEncoder()
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('')
const randomToken = () => TOKEN_PREFIX + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface TokenInfo {
  id: string
  name: string
  permissions: Record<string, ContentPermission>
  expiresAt: string | null
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export function createTokenStore(driver: AtelierDriver, site: SiteContext = singleSite) {
  const { atelier_tokens: table } = buildTables(driver.dialect, { collections: {}, singletons: {}, sites: site.scoped })
  const db = driver.db as Db
  // with sites, a token belongs to the site it was made on, and works only there
  const here = site.scoped ? eq(table.site, site.name) : undefined
  // never the hash
  const info = (row: TokenInfo & { hash: string }): TokenInfo =>
    ({ id: row.id, name: row.name, permissions: row.permissions, expiresAt: row.expiresAt, createdBy: row.createdBy, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, revokedAt: row.revokedAt })

  return {
    /** Creates a token; the returned `token` is the only time it's available. */
    async create(input: { name: string, permissions: Record<string, ContentPermission>, expiresAt?: string | null, createdBy: string }): Promise<TokenInfo & { token: string }> {
      const token = randomToken()
      const row = { id: crypto.randomUUID(), name: input.name, hash: await sha256(token), permissions: input.permissions, expiresAt: input.expiresAt ?? null, createdBy: input.createdBy, createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null }
      await db.insert(table).values({ ...row, ...site.scoped ? { site: site.name } : {} })
      return { ...info(row), token }
    },

    /** The live token for a bearer value: not revoked, not expired. Marks it used (at most once a minute). */
    async verify(token: string): Promise<TokenInfo | undefined> {
      if (!token.startsWith(TOKEN_PREFIX))
        return undefined
      const now = new Date()
      const [row] = await db.select().from(table).where(and(
        eq(table.hash, await sha256(token)),
        isNull(table.revokedAt),
        or(isNull(table.expiresAt), gt(table.expiresAt, now.toISOString())),
        here,
      )).limit(1)
      if (!row)
        return undefined
      if (!row.lastUsedAt || Date.parse(row.lastUsedAt) < now.getTime() - 60_000)
        await db.update(table).set({ lastUsedAt: now.toISOString() }).where(eq(table.id, row.id))
      return info(row)
    },

    list: async (): Promise<TokenInfo[]> => (await db.select().from(table).where(here).orderBy(desc(table.createdAt))).map(info),

    /** Revokes a token for good. Returns it, or undefined when there's no such live token. */
    async revoke(id: string): Promise<TokenInfo | undefined> {
      const [row] = await db.select().from(table).where(and(eq(table.id, id), isNull(table.revokedAt), here)).limit(1)
      if (!row)
        return undefined
      await db.update(table).set({ revokedAt: new Date().toISOString() }).where(eq(table.id, id))
      return info(row)
    },
  }
}

export type TokenStore = ReturnType<typeof createTokenStore>
