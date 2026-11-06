// Database drivers, picked by URL scheme. Each driver package is imported only when its scheme is used,
// so `pg` and `mysql2` are optional peer dependencies.
import type { AnyD1Database, DrizzleD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export type Dialect = 'sqlite' | 'postgres' | 'mysql'

interface Connection {
  /**
   * What the database supports. Cloudflare D1 has no interactive transactions: saves run as one atomic
   * `batch()` instead, and operations that need a transaction fail with UnsupportedOperationError.
   */
  capabilities: { transactions: boolean }
  /** Runs `select 1`; rejects when the database is unreachable. */
  ping: () => Promise<void>
  close: () => Promise<void>
}

export type AtelierDriver
  = | Connection & { dialect: 'sqlite', db: LibSQLDatabase | DrizzleD1Database }
    | Connection & { dialect: 'postgres', db: NodePgDatabase }
    | Connection & { dialect: 'mysql', db: MySql2Database }

/**
 * How to load each driver. In a Nuxt build only the drivers the app installed are included
 * (`#atelier-drivers`), so a Worker build doesn't bundle Node drivers; the CLI and tests load them all
 * (./loaders.ts).
 */
export interface DriverLoaders {
  libsql?: () => Promise<[typeof import('@libsql/client'), typeof import('drizzle-orm/libsql')]>
  pg?: () => Promise<[typeof import('pg'), typeof import('drizzle-orm/node-postgres')]>
  mysql2?: () => Promise<[typeof import('mysql2/promise'), typeof import('drizzle-orm/mysql2')]>
  d1?: () => Promise<typeof import('drizzle-orm/d1')>
}

export interface ConnectOptions {
  loaders: DriverLoaders
  /** Maximum pooled connections (Postgres, MySQL). */
  poolSize?: number
  /** The D1 binding for a `d1:<binding>` URL. Defaults to the binding of that name in the Worker's env. */
  d1?: AnyD1Database
}

/** The database can't run this operation (e.g. a multi-statement transaction on D1). Nothing was changed. */
export class UnsupportedOperationError extends Error {}

const DIALECTS: Record<string, Dialect> = {
  file: 'sqlite',
  d1: 'sqlite',
  libsql: 'sqlite',
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
}

export function dialectOf(url: string): Dialect {
  const dialect = DIALECTS[/^([a-z][a-z0-9]*):/.exec(url)?.[1] ?? '']
  if (!dialect)
    throw new Error(`[nuxt-atelier] Unsupported database URL scheme in "${redact(url)}"; accepted: ${Object.keys(DIALECTS).map(s => `${s}:`).join(', ')}`)
  return dialect
}

/** Hides the password in a connection URL, for error messages. */
export function redact(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^/]*@/, '//$1:***@') // greedy: a password may contain @
}

async function load<T>(loaders: DriverLoaders, name: keyof DriverLoaders, pkg: string): Promise<T> {
  const loader = loaders[name]
  if (!loader)
    throw new Error(`[nuxt-atelier] This build has no driver for this database URL: install "${pkg}" in your app and rebuild`)
  try {
    return await loader() as T
  }
  catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' && String(error).includes(`'${pkg}'`))
      throw new Error(`[nuxt-atelier] This database URL needs the "${pkg}" package: install it in your app`, { cause: error })
    throw error
  }
}

/** Opens a connection pool for the URL. Throws when the database can't be reached. */
export async function connect(url: string, options: ConnectOptions): Promise<AtelierDriver> {
  const dialect = dialectOf(url)
  const driver = url.startsWith('d1:') ? await openD1(url, options) : await open(dialect, url, options)
  try {
    await driver.ping()
  }
  catch (error) {
    await driver.close().catch(() => {})
    throw new Error(`[nuxt-atelier] Can't connect to the ${dialect} database at "${redact(url)}": ${(error as Error).message}`, { cause: error })
  }
  return driver
}

async function open(dialect: Dialect, url: string, { loaders, poolSize = 10 }: ConnectOptions): Promise<AtelierDriver> {
  if (dialect === 'sqlite') {
    const [{ createClient }, { drizzle }] = await load<NonNullable<Awaited<ReturnType<NonNullable<DriverLoaders['libsql']>>>>>(loaders, 'libsql', '@libsql/client')
    if (url.startsWith('file:'))
      await ensureDir(url.slice('file:'.length))
    const client = createClient({ url })
    return { dialect, capabilities, db: drizzle({ client }), ping: async () => void await client.execute('select 1'), close: async () => client.close() }
  }
  if (dialect === 'postgres') {
    const [pg, { drizzle }] = await load<Awaited<ReturnType<NonNullable<DriverLoaders['pg']>>>>(loaders, 'pg', 'pg')
    const { Pool } = pg.default
    const client = new Pool({ connectionString: url, max: poolSize })
    return { dialect, capabilities, db: drizzle({ client }), ping: async () => void await client.query('select 1'), close: () => client.end() }
  }
  const [{ createPool }, { drizzle }] = await load<Awaited<ReturnType<NonNullable<DriverLoaders['mysql2']>>>>(loaders, 'mysql2', 'mysql2')
  const client = createPool({ uri: url.replace(/^mariadb:/, 'mysql:'), connectionLimit: poolSize })
  return { dialect, capabilities, db: drizzle({ client }), ping: async () => void await client.query('select 1'), close: () => client.end() }
}

const capabilities = { transactions: true }

/** Cloudflare D1: opt in with a `d1:<binding>` URL. */
async function openD1(url: string, { loaders, d1: binding }: ConnectOptions): Promise<AtelierDriver> {
  const name = url.slice('d1:'.length)
  const d1 = binding ?? (globalThis as { __env__?: Record<string, AnyD1Database> }).__env__?.[name]
  if (!d1)
    throw new Error(`[nuxt-atelier] No D1 binding "${name}": add it to your wrangler config (d1_databases) or pass it to connect()`)
  const { drizzle } = await load<typeof import('drizzle-orm/d1')>(loaders, 'd1', 'drizzle-orm')
  return {
    dialect: 'sqlite',
    capabilities: { transactions: false },
    db: drizzle(d1),
    ping: async () => void await d1.prepare('select 1').first(),
    close: async () => {}, // the binding is the Worker's, not ours to close
  }
}

/** libSQL doesn't create missing parent directories for a local file. */
async function ensureDir(path: string) {
  if (!path || path.startsWith(':memory:'))
    return
  const { mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(path.replace(/\?.*$/, '')), { recursive: true })
}
