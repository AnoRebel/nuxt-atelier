// Entry rows: mapping between entry data and collection table columns, and the reads/writes every
// engine does the same way. Saves with relations and revisions are in store.ts.
import type { Field } from '../../shared/fields'
import { and, eq, ne } from 'drizzle-orm'

/* eslint-disable @typescript-eslint/no-explicit-any -- one code path for the three dialects' query builders */
/** A dialect's database or an open transaction on it. */
export type Db = any
type Table = any
/* eslint-enable @typescript-eslint/no-explicit-any */

/** No value: undefined, null, '' or an empty list. */
export const isEmpty = (x: unknown) => x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)

/** The column values for entry data. Relations live in their own table; empty values are stored as NULL. */
export function toRow(fields: Record<string, Field>, data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'relation')
      row[key] = isEmpty(data[key]) ? null : data[key]
  }
  return row
}

/** Entry data from a row, without system columns or relations. */
export function fromRow(fields: Record<string, Field>, row: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'relation')
      data[key] = row[key] ?? null
  }
  return data
}

export async function insertRow(db: Db, table: Table, row: Record<string, unknown>): Promise<void> {
  await db.insert(table).values(row)
}

export async function getRow(db: Db, table: Table, id: string): Promise<Record<string, unknown> | undefined> {
  const [row] = await db.select().from(table).where(eq(table._id, id)).limit(1)
  return row
}

/**
 * Whether no entry other than `exceptId` has `value` in `column`: the check `validateEntry` asks for.
 * In a localized collection, within `locale`.
 */
export async function isUnique(db: Db, table: Table, column: string, value: unknown, exceptId?: string, locale?: string): Promise<boolean> {
  const rows = await db.select({ id: table._id }).from(table)
    .where(and(eq(table[column], value), exceptId === undefined ? undefined : ne(table._id, exceptId), locale === undefined ? undefined : eq(table._locale, locale))).limit(1)
  return rows.length === 0
}
