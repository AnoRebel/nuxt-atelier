// The audit log: security-relevant events with who did them, to what, when and from where.
import type { AtelierDriver } from '../db/driver'
import type { Db } from '../db/entries'
import { and, desc, eq, lt } from 'drizzle-orm'
import { buildTables } from '../db/tables'

export type AuditAction
  = | 'setup.completed'
    | 'auth.sign-in' | 'auth.sign-in-failed' | 'auth.sign-out'
    | 'auth.passkey-added' | 'auth.passkey-removed'
    | 'user.created' | 'user.updated' | 'user.deleted'
    | 'role.saved' | 'role.deleted'
    | 'token.created' | 'token.revoked'
    | 'entry.published' | 'entry.unpublished' | 'entry.deleted'
    | 'redirect.created' | 'redirect.updated' | 'redirect.deleted'

export interface AuditInput {
  action: AuditAction
  /** Who did it: a user id, or null when nobody is signed in. */
  actorId: string | null
  target?: { type: string, id: string }
  /** What changed, e.g. `{ role: { from: 'editor', to: 'admin' } }`. Never secrets. */
  details?: Record<string, unknown>
}

export interface AuditEntry extends AuditInput {
  id: string
  at: string
  ip: string | null
}

export function createAuditLog(driver: AtelierDriver) {
  const { atelier_audit: table } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db

  return {
    async record(input: AuditInput, ip: string | null = null): Promise<void> {
      await db.insert(table).values({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: input.action,
        actorId: input.actorId,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        ip,
        details: input.details ?? null,
      })
    },

    /** Newest first. `before`: the `at` of the last entry of the previous page. */
    async list(options: { limit?: number, before?: string, action?: string } = {}): Promise<AuditEntry[]> {
      const filters = [
        ...options.before ? [lt(table.at, options.before)] : [],
        ...options.action ? [eq(table.action, options.action)] : [],
      ]
      const rows = await db.select().from(table).where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(table.at), desc(table.id)).limit(Math.min(options.limit ?? 50, 200))
      return rows.map((r: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any -- a row of any dialect
        id: r.id,
        at: r.at,
        action: r.action,
        actorId: r.actorId,
        ip: r.ip,
        ...r.targetType ? { target: { type: r.targetType, id: r.targetId } } : {},
        ...r.details ? { details: r.details } : {},
      }))
    },
  }
}

export type AuditLog = ReturnType<typeof createAuditLog>
