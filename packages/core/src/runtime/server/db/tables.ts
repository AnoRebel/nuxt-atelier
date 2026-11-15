// Drizzle tables generated from the content schema, for each SQL dialect.
//
//   atelier_c_<collection>  one row per entry: system columns (_id, _version, _created_at, _updated_at, _created_by),
//                           one typed column per field. Scalars get native types; rich text, objects,
//                           repeaters, blocks, multi-selects and JSON are JSON columns. Localized collections
//                           have a row per locale: _locale, and _group linking the translations of an entry.
//   atelier_singletons      one row per singleton, its data as JSON
//   atelier_relations       relation values, normalised so references can be found from either side
//   atelier_revisions       a JSON snapshot per saved version, and whether it was published
//   atelier_routes          URL paths of routable entries, per locale ('' for every locale)
//   atelier_p_…             the published copies of the four above (atelier_p_<collection>, atelier_p_singletons,
//                           atelier_p_relations, atelier_p_routes): what the site serves. The others hold
//                           drafts; publishing copies an entry's rows across. Same columns, so every query
//                           runs on either.
//   atelier_redirects       redirects: entered by administrators, or created when an entry's URL changed
//   atelier_users           CMS users of the built-in auth adapter
//   atelier_sessions        their sessions, so signing out or a password reset can revoke them
//   atelier_audit           security-relevant events: who did what to what, when, from where
//   atelier_tokens          API tokens for headless clients: hashed, scoped, expiring, revocable
//   atelier_rate_limits     counters for rate-limited actions, shared by every server instance
//   atelier_roles           roles edited in the admin (code-defined ones are in server/atelier/roles.ts)
//   atelier_settings        site settings changed in the admin (robots rules…), overriding the module options
//   atelier_locks           who is editing an entry or singleton, until when (renewed while they work)
//   atelier_presence        who has an entry or singleton open, and when they were last seen
//   atelier_comments        comments on entries and their blocks, in threads; never part of published content
//   atelier_notifications   a user's notifications: mentions, replies, lock takeovers
//   atelier_site_roles      with sites: users' roles per site
//   atelier_form_submissions  what visitors sent through forms; uploaded files are in storage under forms/
//   atelier_passkeys        their passkeys (WebAuthn credentials), when passkey sign-in is enabled
//   atelier_jobs            the background job queue: due time, attempts, lock, last error
//   atelier_media           the media library: one row per file, with its metadata and where it's stored
//   atelier_media_uploads   resumable uploads in progress: the chunks received so far
//   atelier_webhooks        outgoing webhooks: target URL, events, the signing secret (encrypted)
//   atelier_webhook_deliveries  each delivery attempt: status or error, how long it took
//
// Every field column is nullable: `required` is enforced by validation, so adding a required field
// later doesn't need a table rewrite. Timestamps are ISO 8601 UTC strings on every engine.
import type { BlockSchema } from '../../shared/blocks'
import type { Field } from '../../shared/fields'
import type { CollectionDefinition, SingletonDefinition } from '../types'
import type { Dialect } from './driver'
import { bigint as myBigint, boolean as myBoolean, datetime as myDatetime, double as myDouble, index as myIndex, int as myInt, json as myJson, mysqlTable, primaryKey as myPrimaryKey, text as myText, uniqueIndex as myUniqueIndex, varchar as myVarchar } from 'drizzle-orm/mysql-core'
import { bigint as pgBigint, boolean as pgBoolean, doublePrecision as pgDouble, timestamp as pgTimestamp, index as pgIndex, integer as pgInteger, jsonb as pgJsonb, primaryKey as pgPrimaryKey, pgTable, text as pgText, uniqueIndex as pgUniqueIndex, varchar as pgVarchar } from 'drizzle-orm/pg-core'
import { index as liteIndex, integer as liteInteger, primaryKey as litePrimaryKey, real as liteReal, sqliteTable, text as liteText, uniqueIndex as liteUniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Locales } from '../../shared/locales'
import { UNIQUE_MAX_LENGTH } from '../../shared/fields'
import { resolveLocales } from '../../shared/locales'
import { checkRoute, MAX_PATH } from '../routes'

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
  /** A JavaScript Date. */
  date: (name: string) => Column
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
    date: name => liteInteger(name, { mode: 'timestamp_ms' }),
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
    date: name => pgTimestamp(name, { withTimezone: true, mode: 'date', precision: 3 }),
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
    date: name => myDatetime(name, { mode: 'date', fsp: 3 }),
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
/** The table holding a collection's published entries. */
export const publishedTable = (name: string) => `atelier_p_${name.replaceAll('-', '_')}`
/** Drafts or what the site serves: which copy of the content tables a query runs on. */
export type Stage = 'draft' | 'published'
/** The name of a draft table's published copy. */
export const published = (table: string) => table.replace(/^atelier_(c_)?/, 'atelier_p_')

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

interface Owner { name: string, singleton: boolean, collections: Record<string, { fields: Record<string, Field> }> }

function checkFields(owner: Owner, fields: Record<string, Field>, path = '', top: Record<string, Field> = fields) {
  const where = `${owner.name}${path}`
  for (const [key, field] of Object.entries(fields)) {
    if (!FIELD_KEY.test(key) || key.length > IDENTIFIER_MAX)
      throw new Error(`[nuxt-atelier] ${where}: field "${key}" must be letters and digits, starting with a letter, at most ${IDENTIFIER_MAX} characters`)
    const scalar = SCALAR_TYPES.has(field.type) || (field.type === 'custom' && field.storage !== 'json')
    if (field.shared && path)
      throw new Error(`[nuxt-atelier] ${where}: field "${key}" can't be shared; only top-level fields can`)
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
      if (field.inverse !== undefined) {
        if (path || owner.singleton)
          throw new Error(`[nuxt-atelier] ${where}: relation "${key}" can't have an inverse; only top-level relations of collections can`)
        const other = owner.collections[field.to]!.fields[field.inverse]
        if (other?.type !== 'relation' || other.to !== owner.name || other.inverse !== key)
          throw new Error(`[nuxt-atelier] ${where}: relation "${key}" has the inverse "${field.to}.${field.inverse}", which must be a relation to "${owner.name}" with inverse "${key}"`)
      }
    }
    if (field.when) {
      const name = field.when.field
      const scope = name.startsWith('/') ? top : fields
      const target = name.replace(/^\//, '')
      if (!(target in scope) || (scope === fields && target === key))
        throw new Error(`[nuxt-atelier] ${where}: field "${key}" applies when "${name}" …, but there's no ${name.startsWith('/') ? 'top-level' : 'sibling'} field "${target}"`)
    }
    if (field.type === 'object' || field.type === 'repeater')
      checkFields(owner, field.fields, `${path}.${key}`, top)
  }
}

export interface ContentSchema {
  collections: Record<string, CollectionDefinition>
  singletons: Record<string, SingletonDefinition>
  /** Extra tables, e.g. an auth adapter's, by table name (from `server/atelier/tables.ts`). */
  tables?: Record<string, TableSpec>
  /** Block schemas by name, for validating blocks fields. */
  blocks?: Record<string, BlockSchema>
  /** The content locales (the `locales` module option): one, `en`, when omitted. */
  locales?: Partial<Locales>
  /** Several sites (the `sites` module option): site-scoped content and system tables get a site column. */
  sites?: boolean
}

/** Whether a collection or singleton's rows belong to a site (`_site`): with sites, unless it's shared. */
export const siteScoped = (schema: Pick<ContentSchema, 'sites'>, definition: { scope?: 'site' | 'shared' } | undefined) =>
  !!schema.sites && definition?.scope !== 'shared'

/** A column of an extra table. JSON, so it travels through migrations like the content schema. */
export interface ColumnSpec {
  type: 'string' | 'number' | 'boolean' | 'date' | 'json'
  /** The SQL column name; defaults to the key. */
  column?: string
  required?: boolean
  unique?: boolean
  index?: boolean
  /** A number beyond 32 bits. */
  bigint?: boolean
  references?: { table: string, onDelete?: 'cascade' | 'set null' | 'set default' | 'restrict' | 'no action' }
}

/** An extra table: a string `id` primary key, plus these columns. */
export interface TableSpec {
  columns: Record<string, ColumnSpec>
}

const TABLE_NAME = /^atelier_[a-z][a-z0-9_]*$/

function specTable(kit: Kit, tables: Record<string, Table>, name: string, spec: TableSpec): Table {
  const columns: Record<string, Column> = { id: kit.key('id', 255).primaryKey() }
  const indexes: [string, 'index' | 'unique'][] = []
  for (const [key, c] of Object.entries(spec.columns)) {
    const sql = c.column ?? key
    const indexed = c.unique || c.index || c.references
    let column = c.type === 'string'
      ? indexed ? kit.key(sql, 255) : kit.text(sql)
      : c.type === 'number'
        ? (c.bigint ? kit.bigint(sql) : kit.int(sql))
        : c.type === 'boolean'
          ? kit.bool(sql)
          : c.type === 'date' ? kit.date(sql) : kit.json(sql)
    if (c.required)
      column = column.notNull()
    if (c.references) {
      const { table, onDelete } = c.references
      if (!(table in tables) && table !== name)
        throw new Error(`[nuxt-atelier] Table ${name}: ${key} references ${table}, which isn't defined before it`)
      column = column.references(() => (table === name ? result : tables[table]).id, onDelete ? { onDelete } : {})
    }
    columns[key] = column
    if (c.unique)
      indexes.push([key, 'unique'])
    else if (c.index || c.references)
      indexes.push([key, 'index'])
  }
  const result = kit.table(name, columns, t => indexes.map(([key, kind]) =>
    (kind === 'unique' ? kit.uniqueIndex(indexName(name, key, 'unique')) : kit.index(indexName(name, key, 'idx'))).on(t[key])))
  return result
}

/** Builds every Atelier table for the dialect, keyed by table name. */
export function buildTables(dialect: Dialect, schema: ContentSchema): Record<string, Table> {
  const kit = kits[dialect]
  const defaultLocale = resolveLocales(schema.locales).default
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
    if (definition.route)
      checkRoute(name, definition.route, definition.fields)
  }
  for (const [name, definition] of Object.entries(schema.singletons)) {
    checkFields({ name, singleton: true, collections: schema.collections }, definition.fields)
    if (definition.route)
      checkRoute(name, definition.route, definition.fields, true)
  }

  // with sites, a singleton has a row per site ('' for a shared one), and paths are per site
  const singletonsTable = (name: string) => schema.sites
    ? kit.table(name, {
        site: kit.key('site', NAME).notNull(),
        name: kit.key('name', NAME).notNull(),
        data: kit.json('data').notNull(),
        version: kit.int('_version').notNull(),
        updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
      }, t => [kit.primaryKey([t.site, t.name])])
    : kit.table(name, {
        name: kit.key('name', NAME).primaryKey(),
        data: kit.json('data').notNull(),
        version: kit.int('_version').notNull(),
        updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
      })
  const relationsTable = (name: string) => kit.table(name, {
    source: kit.key('source', NAME).notNull(),
    sourceId: kit.key('source_id', NAME).notNull(),
    field: kit.key('field', 255).notNull(), // dot path, e.g. `faq.2.author`
    position: kit.int('position').notNull(),
    target: kit.key('target', NAME).notNull(),
    targetId: kit.key('target_id', ID).notNull(),
  }, t => [
    kit.primaryKey([t.source, t.sourceId, t.field, t.position]),
    kit.index(`${name}_target_idx`).on(t.target, t.targetId),
  ])
  const routesTable = (name: string) => kit.table(name, {
    ...schema.sites && { site: kit.key('site', NAME).notNull() }, // '' for a shared type's, served on every site
    path: kit.key('path', MAX_PATH).notNull(), // canonical: see canonicalPath()
    locale: kit.key('locale', 35).notNull(), // '' when the pattern is shared by every locale
    source: kit.key('source', NAME).notNull(),
    sourceId: kit.key('source_id', NAME).notNull(), // an entry id, or a singleton's name
  }, t => [
    kit.primaryKey(schema.sites ? [t.site, t.path, t.locale] : [t.path, t.locale]),
    kit.index(`${name}_source_idx`).on(t.source, t.sourceId),
  ])

  const tables: Record<string, Table> = {
    atelier_singletons: singletonsTable('atelier_singletons'),
    atelier_p_singletons: singletonsTable('atelier_p_singletons'),
    atelier_relations: relationsTable('atelier_relations'),
    atelier_p_relations: relationsTable('atelier_p_relations'),
    atelier_routes: routesTable('atelier_routes'),
    atelier_p_routes: routesTable('atelier_p_routes'),
    atelier_revisions: kit.table('atelier_revisions', {
      id: kit.key('_id', ID).primaryKey(),
      source: kit.key('source', NAME).notNull(),
      sourceId: kit.key('source_id', NAME).notNull(),
      version: kit.int('_version').notNull(),
      data: kit.json('data').notNull(),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      authorId: kit.key('author_id', ID),
      published: kit.bool('published').notNull(), // this version was published when it was saved
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
    atelier_audit: kit.table('atelier_audit', {
      id: kit.key('_id', ID).primaryKey(),
      at: kit.key('at', TIMESTAMP).notNull(),
      action: kit.key('action', NAME).notNull(), // e.g. auth.sign-in, user.updated
      actorId: kit.key('actor_id', ID), // null: not signed in, or the system
      targetType: kit.key('target_type', NAME),
      targetId: kit.key('target_id', 255),
      ip: kit.key('ip', 64),
      details: kit.json('details'),
    }, t => [kit.index('atelier_audit_at_idx').on(t.at), kit.index('atelier_audit_actor_idx').on(t.actorId)]),
    atelier_tokens: kit.table('atelier_tokens', {
      id: kit.key('_id', ID).primaryKey(),
      ...schema.sites && { site: kit.key('site', NAME).notNull() }, // a token works on the site it was made on
      name: kit.key('name', 255).notNull(),
      hash: kit.key('hash', 64).notNull(), // SHA-256 of the token; the token itself is shown once
      permissions: kit.json('permissions').notNull(), // content permissions, as in a role
      expiresAt: kit.key('expires_at', TIMESTAMP),
      createdBy: kit.key('created_by', ID).notNull(),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      lastUsedAt: kit.key('last_used_at', TIMESTAMP),
      revokedAt: kit.key('revoked_at', TIMESTAMP),
    }, t => [kit.uniqueIndex('atelier_tokens_hash_idx').on(t.hash)]),
    atelier_rate_limits: kit.table('atelier_rate_limits', {
      key: kit.key('key', 64).primaryKey(), // SHA-256 of what's limited, e.g. sign-ins from an IP for an email
      count: kit.int('count').notNull(),
      resetAt: kit.key('reset_at', TIMESTAMP).notNull(),
    }),
    atelier_roles: kit.table('atelier_roles', {
      name: kit.key('name', NAME).primaryKey(),
      definition: kit.json('definition').notNull(), // a Role: label, capabilities, content permissions
      updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }),
    atelier_settings: kit.table('atelier_settings', {
      key: kit.key('key', NAME).primaryKey(),
      value: kit.json('value').notNull(),
      updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
      updatedBy: kit.key('_updated_by', ID),
    }),
    // with sites: each user's role on each site they may reach (administrators reach every site)
    ...schema.sites && {
      atelier_site_roles: kit.table('atelier_site_roles', {
        userId: kit.key('user_id', ID).notNull(),
        site: kit.key('site', NAME).notNull(),
        role: kit.key('role', NAME).notNull(),
      }, t => [kit.primaryKey([t.userId, t.site])]),
    },
    atelier_locks: kit.table('atelier_locks', {
      key: kit.key('key', 160).primaryKey(), // <type>:<entry id or singleton name>
      type: kit.key('type', NAME).notNull(),
      entry: kit.key('entry', NAME).notNull(),
      userId: kit.key('user_id', ID).notNull(),
      acquiredAt: kit.key('acquired_at', TIMESTAMP).notNull(),
      expiresAt: kit.key('expires_at', TIMESTAMP).notNull(),
    }),
    atelier_presence: kit.table('atelier_presence', {
      key: kit.key('key', 200).primaryKey(), // <type>:<entry>:<user id>
      type: kit.key('type', NAME).notNull(),
      entry: kit.key('entry', NAME).notNull(),
      userId: kit.key('user_id', ID).notNull(),
      seenAt: kit.key('seen_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_presence_entry_idx').on(t.type, t.entry)]),
    atelier_comments: kit.table('atelier_comments', {
      _id: kit.key('_id', ID).primaryKey(),
      type: kit.key('type', NAME).notNull(),
      entry: kit.key('entry', NAME).notNull(),
      block: kit.key('block', ID), // a block's id, for a comment on that block
      thread: kit.key('thread', ID), // the thread's first comment; null on that first comment
      author: kit.key('author', ID).notNull(),
      body: kit.text('body').notNull(),
      mentions: kit.json('mentions').notNull(), // user ids
      resolvedAt: kit.key('resolved_at', TIMESTAMP),
      resolvedBy: kit.key('resolved_by', ID),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_comments_entry_idx').on(t.type, t.entry), kit.index('atelier_comments_thread_idx').on(t.thread)]),
    atelier_notifications: kit.table('atelier_notifications', {
      _id: kit.key('_id', ID).primaryKey(),
      userId: kit.key('user_id', ID).notNull(),
      kind: kit.key('kind', 32).notNull(), // mention, reply, takeover
      data: kit.json('data').notNull(), // what it's about: the entry, the comment, who
      readAt: kit.key('read_at', TIMESTAMP),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_notifications_user_idx').on(t.userId, t.createdAt)]),
    atelier_form_submissions: kit.table('atelier_form_submissions', {
      _id: kit.key('_id', ID).primaryKey(),
      form: kit.key('form', ID).notNull(),
      version: kit.int('form_version').notNull(), // the form's published version it answered
      locale: kit.key('locale', 35).notNull(), // '' when the site isn't localized
      data: kit.json('data').notNull(), // values by field name; files as { name, type, size }
      emails: kit.key('emails', 1024).notNull(), // its email values, lowercased, between commas: for erasure requests
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_form_submissions_form_idx').on(t.form, t.createdAt)]),
    atelier_passkeys: kit.table('atelier_passkeys', {
      id: kit.key('_id', 255).primaryKey(), // the credential id, base64url
      userId: kit.key('user_id', ID).notNull(),
      publicKey: kit.text('public_key').notNull(), // base64url COSE key
      counter: kit.bigint('counter').notNull(),
      transports: kit.json('transports'),
      name: kit.key('name', 255),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      lastUsedAt: kit.key('last_used_at', TIMESTAMP),
    }, t => [kit.index('atelier_passkeys_user_idx').on(t.userId)]),
    atelier_jobs: kit.table('atelier_jobs', {
      id: kit.key('_id', ID).primaryKey(),
      name: kit.key('name', NAME).notNull(), // the job type's handler
      key: kit.key('key', 255), // at most one job per key: enqueueing again replaces it
      payload: kit.json('payload').notNull(),
      status: kit.key('status', 16).notNull(), // queued, running, failed
      runAt: kit.key('run_at', TIMESTAMP).notNull(),
      attempts: kit.int('attempts').notNull(),
      maxAttempts: kit.int('max_attempts').notNull(),
      lockedUntil: kit.key('locked_until', TIMESTAMP), // a running job whose lock passed is taken again
      lastError: kit.text('last_error'),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_jobs_due_idx').on(t.status, t.runAt), kit.uniqueIndex('atelier_jobs_key_idx').on(t.key)]),
    atelier_media: kit.table('atelier_media', {
      _id: kit.key('_id', ID).primaryKey(),
      ...schema.sites && { site: kit.key('site', NAME) }, // null: shared by every site
      key: kit.key('key', 255).notNull(), // the storage driver's key
      filename: kit.key('filename', 255).notNull(),
      mime: kit.key('mime', 127).notNull(), // from the file's content, not its name
      size: kit.bigint('size').notNull(),
      width: kit.int('width'),
      height: kit.int('height'),
      title: kit.text('title'),
      alt: kit.json('alt'), // per locale: { en: '…' }, '' for one shared by every locale
      caption: kit.text('caption'),
      credits: kit.text('credits'),
      folder: kit.key('folder', 255).notNull(), // '' for the top level, else like "team/2026"
      tags: kit.json('tags').notNull(),
      focal: kit.json('focal'), // { x, y } from 0 to 1
      private: kit.bool('private').notNull(),
      _createdBy: kit.key('_created_by', ID),
      _createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
      _updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_media_folder_idx').on(t.folder), kit.index('atelier_media_created_idx').on(t._createdAt)]),
    atelier_media_uploads: kit.table('atelier_media_uploads', {
      id: kit.key('_id', ID).primaryKey(),
      filename: kit.key('filename', 255).notNull(),
      folder: kit.key('folder', 255).notNull(),
      private: kit.bool('private').notNull(),
      size: kit.bigint('size').notNull(), // the whole file's, announced at the start
      received: kit.bigint('received').notNull(),
      parts: kit.json('parts').notNull(), // [{ offset, size }]: the chunks stored, in order
      createdBy: kit.key('created_by', ID),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }),
    atelier_webhooks: kit.table('atelier_webhooks', {
      id: kit.key('_id', ID).primaryKey(),
      url: kit.text('url').notNull(),
      events: kit.json('events').notNull(), // e.g. ["entry.published"]
      types: kit.json('types'), // collections and singletons; null for all
      secret: kit.text('secret').notNull(), // AES-GCM under a key derived from the app secret
      active: kit.bool('active').notNull(),
      createdBy: kit.key('created_by', ID).notNull(),
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }),
    atelier_webhook_deliveries: kit.table('atelier_webhook_deliveries', {
      id: kit.key('_id', ID).primaryKey(),
      webhookId: kit.key('webhook_id', ID).notNull(),
      messageId: kit.key('message_id', 64).notNull(), // the webhook-id header: the same on every attempt
      event: kit.key('event', NAME).notNull(),
      attempt: kit.int('attempt').notNull(),
      status: kit.int('status'), // the response's, or null when none came
      error: kit.text('error'),
      durationMs: kit.int('duration_ms').notNull(),
      at: kit.key('at', TIMESTAMP).notNull(),
    }, t => [kit.index('atelier_webhook_deliveries_webhook_idx').on(t.webhookId, t.at)]),
    atelier_redirects: kit.table('atelier_redirects', {
      id: kit.key('_id', ID).primaryKey(),
      ...schema.sites && { site: kit.key('site', NAME).notNull() },
      source: kit.key('source', MAX_PATH).notNull(), // a canonical path, or a pattern with :name and a final *
      target: kit.text('target').notNull(), // a site path or an absolute http(s) URL
      status: kit.int('status').notNull(),
      auto: kit.bool('auto').notNull(), // created when an entry's URL changed
      createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
    }, t => [kit.uniqueIndex('atelier_redirects_source_idx').on(...schema.sites ? [t.site, t.source] : [t.source])]),
  }

  for (const [name, spec] of Object.entries(schema.tables ?? {})) {
    if (!TABLE_NAME.test(name) || name.length > IDENTIFIER_MAX || name in tables || /^atelier_[cp]_/.test(name))
      throw new Error(`[nuxt-atelier] Extra table "${name}": use a name starting with atelier_ (not atelier_c_ or atelier_p_), in lowercase letters, digits and _, that no other table uses`)
    tables[name] = specTable(kit, tables, name, spec)
  }

  for (const [name, definition] of Object.entries(schema.collections)) {
    // built per table: a column builder belongs to the table it's built into
    const columns = (): Record<string, Column> => {
      const result: Record<string, Column> = {
        _id: kit.key('_id', ID).primaryKey(),
        _version: kit.int('_version').notNull(),
        _createdAt: kit.key('_created_at', TIMESTAMP).notNull(),
        _updatedAt: kit.key('_updated_at', TIMESTAMP).notNull(),
        _createdBy: kit.key('_created_by', ID), // the user who created it, for own-entries-only permissions
        ...siteScoped(schema, definition) && { _site: kit.key('_site', NAME).notNull() },
        // localized: each locale's version is a row; translations share a group, the first one's id (null: its own)
        ...definition.localized && {
          _locale: kit.key('_locale', 35).notNull().default(defaultLocale),
          _group: kit.key('_group', ID),
        },
      }
      for (const [key, field] of Object.entries(definition.fields)) {
        const column = fieldColumn(kit, key, field)
        if (column)
          result[key] = column
      }
      return result
    }
    const unique = Object.entries(definition.fields).filter(([, f]) => f.unique).map(([key]) => key)
    // in a localized collection, values are unique within a locale: translations may share one
    for (const table of [collectionTable(name), publishedTable(name)]) {
      tables[table] = kit.table(table, columns(), t => [
        ...unique.map(key => kit.uniqueIndex(indexName(table, key, 'unique')).on(...siteScoped(schema, definition) ? [t._site] : [], ...definition.localized ? [t._locale, t[key]] : [t[key]])),
        ...siteScoped(schema, definition) ? [kit.index(indexName(table, '_site', 'idx')).on(t._site)] : [],
        ...definition.localized ? [kit.index(indexName(table, '_group', 'idx')).on(t._group)] : [],
      ])
    }
  }
  return tables
}
