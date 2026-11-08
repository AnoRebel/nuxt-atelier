// The query language for listing entries: filters (and/or groups, comparisons, contains, in, null),
// sorting, and keyset (cursor) or offset pagination, compiled to SQL for each dialect.
//
// Filters and sorts name top-level fields, or the system fields `_id`, `_createdAt`, `_updatedAt` and
// `_createdBy`. Nulls sort last in both directions on every engine, so pages are the same everywhere.
import type { SQL } from 'drizzle-orm'
import type { Field } from '../../shared/fields'
import type { Dialect } from './driver'
import type { Db } from './entries'
import { and, eq, exists, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, not, or, sql } from 'drizzle-orm'

export type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'null'
export type Condition = Partial<Record<Operator, unknown>>
export type Filter = { and: Filter[] } | { or: Filter[] } | { [field: string]: Condition }

export interface ListQuery {
  filter?: Filter
  /** Field names, `-` first for descending: `['-publishedAt', 'title']`. */
  sort?: string[]
  limit?: number
  offset?: number
  /** From a previous page's `next`; takes precedence over `offset`. */
  cursor?: string
}

/** A query names a field or operator it can't use. */
export class QueryError extends Error {
  readonly statusCode = 400
}

const SYSTEM = { _id: '_id', _createdAt: '_createdAt', _updatedAt: '_updatedAt', _createdBy: '_createdBy' } as const
const ORDERED = new Set<Field['type']>(['text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'slug', 'color', 'media'])
const TEXT = new Set<Field['type']>(['text', 'textarea', 'email', 'url', 'slug'])
const SCALAR = new Set<Field['type']>([...ORDERED, 'boolean'])
const MAX_FILTER_DEPTH = 5
const MAX_IN = 100

export interface CompileContext {
  dialect: Dialect
  fields: Record<string, Field>
  table: Db
  relations: Db
  source: string
  /** `SELECT 1 FROM atelier_relations WHERE …`, for EXISTS. */
  relationsQuery: (where: SQL) => Db
}

// `!` escapes: a backslash would itself need escaping in MySQL's string literals
const escapeLike = (text: string) => text.replace(/[!%_]/g, c => `!${c}`)

function fieldOf(context: CompileContext, name: string): { column: Db, field?: Field } {
  if (name in SYSTEM)
    return { column: context.table[SYSTEM[name as keyof typeof SYSTEM]] }
  const field = context.fields[name]
  if (!field)
    throw new QueryError(`Unknown field "${name}"`)
  return { column: context.table[name], field }
}

function scalarValue(name: string, op: string, value: unknown) {
  if (value === null || !['string', 'number', 'boolean'].includes(typeof value))
    throw new QueryError(`${name}.${op}: expected a string, number or boolean`)
  return value
}

function relationCondition(context: CompileContext, name: string, op: Operator, value: unknown): SQL {
  const { relations, table, source } = context
  const link = (extra?: SQL) => exists(context.relationsQuery(and(
    eq(relations.source, source),
    eq(relations.sourceId, table._id),
    eq(relations.field, name),
    extra,
  )!))
  switch (op) {
    case 'eq':
    case 'contains':
      return link(eq(relations.targetId, String(scalarValue(name, op, value))))
    case 'ne':
      return not(link(eq(relations.targetId, String(scalarValue(name, op, value)))))!
    case 'in':
      return link(inArray(relations.targetId, listValue(name, value).map(String)))
    case 'null':
      return value ? not(link())! : link()
    default:
      throw new QueryError(`${name}: a relation takes eq, ne, contains, in or null, not ${op}`)
  }
}

function listValue(name: string, value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN)
    throw new QueryError(`${name}.in: expected a list of 1 to ${MAX_IN} values`)
  return value.map(v => scalarValue(name, 'in', v))
}

/** `multiSelect` contains: a JSON array column holding the value. */
function jsonContains(dialect: Dialect, column: Db, value: string): SQL {
  if (dialect === 'postgres')
    return sql`${column} @> ${JSON.stringify([value])}::jsonb`
  if (dialect === 'mysql')
    return sql`JSON_CONTAINS(${column}, ${JSON.stringify(value)})`
  return sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_each.value = ${value})`
}

function condition(context: CompileContext, name: string, ops: Condition): SQL {
  const { column, field } = fieldOf(context, name)
  const parts = Object.entries(ops).map(([op, value]): SQL => {
    if (op === 'null')
      return field?.type === 'relation' ? relationCondition(context, name, 'null', value) : value ? isNull(column) : isNotNull(column)
    if (field?.type === 'relation')
      return relationCondition(context, name, op as Operator, value)
    const type = field?.type
    if (op === 'contains') {
      if (type === 'multiSelect')
        return jsonContains(context.dialect, column, String(scalarValue(name, op, value)))
      if (!type || !TEXT.has(type))
        throw new QueryError(`${name}: contains works on text fields, multiSelect and relations`)
      // case-insensitive everywhere: MySQL already is, SQLite only for ASCII, Postgres isn't
      return sql`lower(${column}) LIKE ${`%${escapeLike(String(scalarValue(name, op, value)).toLowerCase())}%`} ESCAPE '!'`
    }
    if (type && !SCALAR.has(type))
      throw new QueryError(`${name}: a ${type} field can only be filtered with null`)
    if (op === 'in')
      return inArray(column, listValue(name, value))
    const compare = { eq, ne, gt, gte, lt, lte }[op as 'eq']
    if (!compare)
      throw new QueryError(`${name}: unknown operator "${op}"; use eq, ne, gt, gte, lt, lte, contains, in or null`)
    if (op !== 'eq' && op !== 'ne' && type && !ORDERED.has(type))
      throw new QueryError(`${name}: a ${type} field can't be compared with ${op}`)
    return compare(column, scalarValue(name, op, value))
  })
  if (!parts.length)
    throw new QueryError(`${name}: expected at least one operator`)
  return and(...parts)!
}

/** The WHERE clause for a filter. */
export function compileFilter(context: CompileContext, filter: Filter, depth = 0): SQL {
  if (depth > MAX_FILTER_DEPTH)
    throw new QueryError(`Filters nest at most ${MAX_FILTER_DEPTH} levels deep`)
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter))
    throw new QueryError('A filter is an object')
  const parts = Object.entries(filter).map(([key, value]): SQL => {
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value) || value.length === 0)
        throw new QueryError(`${key}: expected a list of filters`)
      const group = value.map(f => compileFilter(context, f, depth + 1))
      return (key === 'and' ? and(...group) : or(...group))!
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new QueryError(`${key}: expected operators, like { "eq": "news" }`)
    return condition(context, key, value as Condition)
  })
  return parts.length ? and(...parts)! : sql`1 = 1`
}

export interface SortKey { column: Db, name: string, desc: boolean }

/** The sort keys, always ending in `_id` so the order is total. */
export function compileSort(context: CompileContext, sort: string[] = []): SortKey[] {
  const keys = sort.map((spec) => {
    const desc = spec.startsWith('-')
    const name = desc ? spec.slice(1) : spec
    const { column, field } = fieldOf(context, name)
    if (field && !SCALAR.has(field.type))
      throw new QueryError(`${name}: a ${field.type} field can't be sorted`)
    return { column, name, desc }
  })
  if (!keys.some(k => k.name === '_id'))
    keys.push({ column: context.table._id, name: '_id', desc: false })
  return keys
}

/** ORDER BY with nulls last in both directions, the same on every engine. */
export const orderBy = (keys: SortKey[]) =>
  keys.flatMap(k => [sql`(${k.column} IS NULL)`, k.desc ? sql`${k.column} DESC` : sql`${k.column} ASC`])

export const encodeCursor = (values: unknown[]) => btoa(JSON.stringify(values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function decodeCursor(cursor: string, keys: SortKey[]): unknown[] {
  try {
    const values = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')))
    if (Array.isArray(values) && values.length === keys.length)
      return values
  }
  catch {
    // not base64 JSON: the error below
  }
  throw new QueryError('Invalid cursor: use the `next` value of the previous page, with the same sort')
}

/** Rows after the cursor row, in `keys` order (nulls last). */
export function afterCursor(keys: SortKey[], values: unknown[], i = 0): SQL {
  const { column, desc } = keys[i]!
  const value = values[i]
  const rest = i + 1 < keys.length ? afterCursor(keys, values, i + 1) : undefined
  if (value === null) // only nulls come after a null
    return rest ? and(isNull(column), rest)! : sql`1 = 0`
  const beyond = desc ? lt(column, value) : gt(column, value)
  return or(beyond, isNull(column), ...rest ? [and(eq(column, value), rest)] : [])!
}
