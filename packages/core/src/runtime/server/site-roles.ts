// Per-site roles (with `sites`): a user reaches a site through a role there; administrators reach every
// site. Kept apart from the auth adapter's users, so it works with any of them.
import type { AtelierDriver } from './db/driver'
import type { Db } from './db/entries'
import { and, eq } from 'drizzle-orm'
import { buildTables } from './db/tables'

export function createSiteRoleStore(driver: AtelierDriver) {
  const { atelier_site_roles: table } = buildTables(driver.dialect, { collections: {}, singletons: {}, sites: true })
  const db = driver.db as Db
  return {
    /** The user's role on a site, or undefined: no access there. */
    async roleOn(userId: string, site: string): Promise<string | undefined> {
      const [row] = await db.select({ role: table.role }).from(table).where(and(eq(table.userId, userId), eq(table.site, site))).limit(1)
      return row?.role
    },
    /** The user's roles, by site. */
    async of(userId: string): Promise<Record<string, string>> {
      const rows: { site: string, role: string }[] = await db.select({ site: table.site, role: table.role }).from(table).where(eq(table.userId, userId))
      return Object.fromEntries(rows.map(r => [r.site, r.role]))
    },
    /** Replaces the user's roles: `{ shop: 'editor' }`; a site left out loses access. */
    async set(userId: string, roles: Record<string, string>): Promise<void> {
      await db.delete(table).where(eq(table.userId, userId))
      for (const [site, role] of Object.entries(roles))
        await db.insert(table).values({ userId, site, role })
    },
  }
}

export type SiteRoleStore = ReturnType<typeof createSiteRoleStore>
