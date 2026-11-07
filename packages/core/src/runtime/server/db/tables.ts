// Drizzle tables generated from the content schema, for each SQL dialect.
//
//   atelier_c_<collection>  one row per entry: system columns (_id, _version, _created_at, _updated_at),
//                           one typed column per field. Scalars get native types; rich text, objects,
//                           repeaters, blocks, multi-selects and JSON are JSON columns.
//   atelier_singletons      one row per singleton, its data as JSON
//   atelier_relations       relation values, normalised so references can be found from either side
//   atelier_revisions       a JSON snapshot per saved version
//   atelier_routes          URL paths of routable entries
//   atelier_users           CMS users of the built-in auth adapter
//   atelier_sessions        their sessions, so signing out or a password reset can revoke them
//
// Every field column is nullable: `required` is enforced by validation, so adding a required field
// later doesn't need a table rewrite. Timestamps are ISO 8601 UTC strings on every engine.
import type { Field } from '../../shared/fields'
import type { CollectionDefinition, SingletonDefinition } from '../types'
import type { Dialect } from './driver'
import { bigint as myBigint, boolean as myBoolean, double as myDouble, index as myIndex, int as myInt, json as myJson, mysqlTable, primaryKey as myPrimaryKey, text as myText, uniqueIndex as myUniqueIndex, varchar as myVarchar } from 'drizzle-orm/mysql-core'
import { bigint as pgBigint, boolean as pgBoolean, doublePrecision as pgDouble, index as pgIndex, integer as pgInteger, jsonb as pgJsonb, primaryKey as pgPrimaryKey, pgTable, text as pgText, uniqueIndex as pgUniqueIndex, varchar as pgVarchar } from 'drizzle-orm/pg-core'
import { index as liteIndex, integer as liteInteger, primaryKey as litePrimaryKey, real as liteReal, sqliteTable, text as liteText, uniqueIndex as liteUniqueIndex } from 'drizzle-orm/sqlite-core'
import { UNIQUE_MAX_LENGTH } from '../../shared/fields'

/* eslint-disable @typescript-eslint/no-explicit-any -- column builders differ per dialect; the tables are typed by use, not here */
type Column = any
type Table = any

interface Kit {
  table: (name: string, columns: Record<string, Column>, extra?: (t: Record<string, Column>) => unknown[]) => Table
  /** A short string: ids, names, keys. */
  key: (name: string, length: number) => Column
  text: (name: string, maxLength?: number) => Column
  int: (name: string) => Column
  bigint: (name: string) => Column
  float: (name: string) => Column
  bool: (name: string) => Column
  json: (name: string) => Column
  index: (name: string) => { on: (...columns: Column[]) => unknown }
  uniqueIndex: (name: string) => { on: (...columns: Column[]) => unknown }
  primaryKey: (columns: Column[]) => unknown
}

const kits: Record<Dialect, Kit> = {
  sqlite: {
    table: sqliteTable as never,
    key: name => liteText(name),
    text: name => liteText(name),
    int: name => liteInteger(name),
    bigint: name => liteInteger(name),
    float: name => liteReal(name),
    bool: name => liteInteger(name, { mode: 'boolean' }),
    json: name => liteText(name, { mode: 'json' }),
    index: liteIndex,
    uniqueIndex: liteUniqueIndex,
    primaryKey: columns => litePrimaryKey({ columns: columns as never }),
  },
  postgres: {
    table: pgTable as never,
    key: (name, length) => pgVarchar(name, { length }),
    text: name => pgText(name),
    int: name => pgInteger(name),
    bigint: name => pgBigint(name, { mode: 'number' }),
    float: name => pgDouble(name),
    bool: name => pgBoolean(name),
    json: name => pgJsonb(name),
    index: pgIndex,
    uniqueIndex: pgUniqueIndex,
    primaryKey: columns => pgPrimaryKey({ columns: columns as never }),
  },
  mysql: {
    table: mysqlTable as never,
    key: (name, length) => myVarchar(name, { length }),
    // MySQL can't index TEXT: indexed strings are VARCHAR, bounded by validation (UNIQUE_MAX_LENGTH)
    text: (name, maxLength) => maxLength === undefined ? myText(name) : myVarchar(name, { length: maxLength }),
    int: name => myInt(name),
    bigint: name => myBigint(name, { mode: 'number' }),
    float: name => myDouble(name),
    bool: name => myBoolean(name),
    json: name => myJson(name),
    index: myIndex,
    uniqueIndex: myUniqueIndex,
    primaryKey: columns => myPrimaryKey({ columns: columns as never }),
  },
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ID = 36 // crypto.randomUUID()
const NAME = 64
const TIMESTAMP = 24 // 2026-11-03T10:00:00.000Z
const IDENTIFIER_MAX = 63 // Postgres; MySQL allows 64
const FIELD_KEY = /^[a-z][a-z0-9]*$/i

const SCALAR_TYPES = new Set<Field['type']>(['text', 'textarea', 'number', 'boolean', 'select', 'date', 'email', 'url', 'slug', 'color', 'media'])

/** The table name for a collection. */
export const collectionTable = (name: string) => `atelier_c_${name.replaceAll('-', '_')}`

/** An index name within the identifier limit: long names keep a readable prefix and get a hash suffix. */
export function indexName(table: string, column: string, suffix: string): string {
  const name = `${table}_${column}_${suffix}`
  if (name.length <= IDENTIFIER_MAX)
    return name
  let hash = 0
  for (const char of name)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return `${name.slice(0, IDENTIFIER_MAX - 9)}_${hash.toString(36).padStart(8, '0')}`
}

function fieldColumn(kit: Kit, key: string, field: Field): Column | undefined {
  switch (field.type) {
    case 'relation':
      return undefined // stored in atelier_relations
    case 'number':
      return field.integer ? kit.bigint(key) : kit.float(key)
    case 'boolean':
      return kit.bool(key)
    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
    case 'slug':
      return kit.text(key, field.unique ? field.maxLength ?? UNIQUE_MAX_LENGTH : undefined)
    case 'select':
    case 'date':
    case 'color':
    case 'media':
      return kit.text(key, field.unique ? UNIQUE_MAX_LENGTH : undefined)
    case 'custom':
      return field.storage === 'text'
        ? kit.text(key, field.unique ? UNIQUE_MAX_LENGTH : undefined)
        : field.storage === 'number' ? kit.float(key) : field.storage === 'boolean' ? kit.bool(key) : kit.json(key)
    default:
      return kit.json(key)
  }
}

interface Owner { name: string, singleton: boolean, collections: Record<string, unknown> }

function checkFields(owner: Owner, fields: Record<string, Field>, path = '') {
  const where = `${owner.name}${path}`
  for (const [key, field] of Object.entries(fields)) {
    if (!FIELD_KEY.test(key) || key.length > IDENTIFIER_MAX)
      throw new Error(`[nuxt-atelier] ${where}: field "${key}" must be letters and digits, starting with a letter, at most ${IDENTIFIER_MAX} characters`)
    const scalar = SCALAR_TYPES.has(field.type) || (field.type === 'custom' && field.storage !== 'json')
    if (field.unique && (path || !scalar))
      throw new Error(`[nuxt-atelier] ${where}: field "${key}" can't be unique; only top-level ${[...SCALAR_TYPES].join(', ')} fields can`)
    if (field.renamedFrom !== undefined) {
      if (path)
        throw new Error(`[nuxt-atelier] ${where}: field "${key}" can't declare renamedFrom; only top-level fields can be renamed`)
      if (!FIELD_KEY.test(field.renamedFrom) || field.renamedFrom in fields)
        throw new Error(`[nuxt-atelier] ${where}: field "${key}" is renamedFrom "${field.renamedFrom}", which must be a valid field key that no other field uses`)
    }
    if (field.type === 'relation') {
      if (!(field.to in owner.collections))
        throw new Error(`[nuxt-atelier] ${where}: relation "${key}" points to "${field.to}", which isn't a collection`)
      if (field.onDelete === 'cascade' && owner.singleton)
        throw new Error(`[nuxt-atelier] ${where}: relation "${key}" can't cascade deletes: a singleton can't be deleted. Use "restrict" or "nullify"`)
    }
    if (field.type === 'object' || field.type === 'repeater')
      checkFields(owner, field.fields, `${path}.${key}`)
  }
}

export interface ContentSchema {
  collections: Record<string, CollectionDefinition>
  singletons: Record<string, SingletonDefinition>
}

/** Builds every Atelier table for the dialect, keyed by table name. */
export function buildTables(dialect: Dialect, schema: ContentSchema): Record<string, Table> {
  const kit = kits[dialect]
  for (const name of Object.keys(schema.collections)) {
    if (name in schema.singletons)
      throw new Error(`[nuxt-atelier] "${name}" is both a collection and a singleton; rename one`)
    if (collectionTable(name).length > IDENTIFIER_MAX)
      throw new Error(`[nuxt-atelier] Collection name "${name}" is too long: at most ${IDENTIFIER_MAX - collectionTable('').length} characters`)
  }
  for (const [name, definition] of Object.entries(schema.collections)) {
    const from = definition.renamedFrom
    if (from !== undefined && (!/^[a-z][a-z0-9-]*$/.test(from) || from in schema.collections || from in schema.singletons))
      throw new Error(`[nuxt-atelier] Collection "${name}" is renamedFrom "${from}", which must be a valid collection name that nothing else uses`)
    checkFields({ name, singleton: false, collections: schema.collections }, definition.fields)
  }
  for (const [name, definition] of Object.entries(schema.singletons))
    checkFields({ name, singleton: true, collections: schema.collections }, definition.fields)

  const tables: Record<string, Table> = {
    atelier_singletons: kit.table('atelier_singletons', {
      name: kit.key('name', NAME).primaryKey(),
      data: kit.json('data').notNull(),
      version: kit.int('_version').notNull(),
      updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }),
    atelier_relations: kit.table('atelier_relations', {
      source: kit.key('source', NAME).notNull(),
      sourceId: kit.key('source_id', NAME).notNull(),
      field: kit.key('field', 255).notNull(), // dot path, e.g. `faq.2.author`
      position: kit.int('position').notNull(),
      target: kit.key('target', NAME).notNull(),
      targetId: kit.key('target_id', ID).notNull(),
    }, t => [
      kit.primaryKey([t.source, t.sourceId, t.field, t.position]),
      kit.index('atelier_relations_target_idx').on(t.target, t.targetId),
    ]),
    atelier_revisions: kit.table('atelier_revisions', {
      id: kit.key('_id', ID).primaryKey(),
      source: kit.key('source', NAME).notNull(),
      sourceId: kit.key('source_id', NAME).notNull(),
      version: kit.int('_version').notNull(),
      data: kit.json('data').notNull(),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      authorId: kit.key('author_id', ID),
    }, t => [kit.uniqueIndex('atelier_revisions_source_version_idx').on(t.source, t.sourceId, t.version)]),
    atelier_users: kit.table('atelier_users', {
      id: kit.key('_id', ID).primaryKey(),
      email: kit.key('email', 255).notNull(), // stored lowercase
      name: kit.key('name', 255),
      role: kit.key('role', NAME).notNull(),
      passwordHash: kit.key('password_hash', 255), // null for users who sign in another way
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }, t => [kit.uniqueIndex('atelier_users_email_idx').on(t.email)]),
    atelier_sessions: kit.table('atelier_sessions', {
      id: kit.key('_id', 64).primaryKey(), // SHA-256 of the session id in the cookie
      userId: kit.key('user_id', ID).notNull(),
      method: kit.key('method', 16).notNull(), // how it signed in: password, passkey
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      expiresAt: kit.key('expires_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_sessions_user_idx').on(t.userId)]),
    atelier_routes: kit.table('atelier_routes', {
      path: kit.key('path', 255).primaryKey(),
      source: kit.key('source', NAME).notNull(),
      sourceId: kit.key('source_id', ID).notNull(),
    }, t => [kit.index('atelier_routes_source_idx').on(t.source, t.sourceId)]),
  }

  for (const [name, definition] of Object.entries(schema.collections)) {
    const table = collectionTable(name)
    const columns: Record<string, Column> = {
      _id: kit.key('_id', ID).primaryKey(),
      _version: kit.int('_version').notNull(),
      _createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      _updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }
    const unique: string[] = []
    for (const [key, field] of Object.entries(definition.fields)) {
      const column = fieldColumn(kit, key, field)
      if (column)
        columns[key] = column
      if (field.unique)
        unique.push(key)
    }
    tables[table] = kit.table(table, columns, t => unique.map(key => kit.uniqueIndex(indexName(table, key, 'unique')).on(t[key])))
  }
  return tables
}
