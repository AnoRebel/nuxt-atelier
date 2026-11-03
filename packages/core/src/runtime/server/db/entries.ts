// Entry rows: mapping between entry data and collection table columns, and the reads/writes every
// engine does the same way. Saves with revisions and relations build on this (task 5.5).
import type { Field } from '../../shared/fields'
import type { AtelierDriver } from './driver'
import { and, eq, ne } from 'drizzle-orm'

/* eslint-disable @typescript-eslint/no-explicit-any -- one code path for the three dialects' query builders */
type Db = any
type Table = any
/* eslint-enable @typescript-eslint/no-explicit-any */

const isEmpty = (x: unknown) => x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)

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

export async function insertRow(driver: AtelierDriver, table: Table, row: Record<string, unknown>): Promise<void> {
  await (driver.db as Db).insert(table).values(row)
}

export async function getRow(driver: AtelierDriver, table: Table, id: string): Promise<Record<string, unknown> | undefined> {
  const [row] = await (driver.db as Db).select().from(table).where(eq(table._id, id)).limit(1)
  return row
}

/** Whether no entry other than `exceptId` has `value` in `column`: the check `validateEntry` asks for. */
export async function isUnique(driver: AtelierDriver, table: Table, column: string, value: unknown, exceptId?: string): Promise<boolean> {
  const match = eq(table[column], value)
  const rows = await (driver.db as Db).select({ id: table._id }).from(table)
    .where(exceptId === undefined ? match : and(match, ne(table._id, exceptId))).limit(1)
  return rows.length === 0
}
