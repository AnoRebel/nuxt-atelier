// Database drivers, picked by URL scheme. Each driver package is imported only when its scheme is used,
// so `pg` and `mysql2` are optional peer dependencies.
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export type Dialect = 'sqlite' | 'postgres' | 'mysql'

interface Connection {
  /** Runs `select 1`; rejects when the database is unreachable. */
  ping: () => Promise<void>
  close: () => Promise<void>
}

export type AtelierDriver
  = | Connection & { dialect: 'sqlite', db: LibSQLDatabase }
    | Connection & { dialect: 'postgres', db: NodePgDatabase }
    | Connection & { dialect: 'mysql', db: MySql2Database }

export interface ConnectOptions {
  /** Maximum pooled connections (Postgres, MySQL). */
  poolSize?: number
}

const DIALECTS: Record<string, Dialect> = {
  file: 'sqlite',
  libsql: 'sqlite',
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
}

export function dialectOf(url: string): Dialect {
  const dialect = DIALECTS[/^([a-z]+):/.exec(url)?.[1] ?? '']
  if (!dialect)
    throw new Error(`[nuxt-atelier] Unsupported database URL scheme in "${redact(url)}"; accepted: ${Object.keys(DIALECTS).map(s => `${s}:`).join(', ')}`)
  return dialect
}

/** Hides the password in a connection URL, for error messages. */
export function redact(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^/]*@/, '//$1:***@') // greedy: a password may contain @
}

async function load<T>(pkg: string, importer: () => Promise<T>): Promise<T> {
  try {
    return await importer()
  }
  catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' && String(error).includes(`'${pkg}'`))
      throw new Error(`[nuxt-atelier] This database URL needs the "${pkg}" package: install it in your app`, { cause: error })
    throw error
  }
}

/** Opens a connection pool for the URL. Throws when the database can't be reached. */
export async function connect(url: string, options: ConnectOptions = {}): Promise<AtelierDriver> {
  const dialect = dialectOf(url)
  const driver = await open(dialect, url, options.poolSize ?? 10)
  try {
    await driver.ping()
  }
  catch (error) {
    await driver.close().catch(() => {})
    throw new Error(`[nuxt-atelier] Can't connect to the ${dialect} database at "${redact(url)}": ${(error as Error).message}`, { cause: error })
  }
  return driver
}

async function open(dialect: Dialect, url: string, poolSize: number): Promise<AtelierDriver> {
  if (dialect === 'sqlite') {
    const { createClient } = await load('@libsql/client', () => import('@libsql/client'))
    const { drizzle } = await import('drizzle-orm/libsql')
    if (url.startsWith('file:'))
      await ensureDir(url.slice('file:'.length))
    const client = createClient({ url })
    return { dialect, db: drizzle({ client }), ping: async () => void await client.execute('select 1'), close: async () => client.close() }
  }
  if (dialect === 'postgres') {
    const { Pool } = (await load('pg', () => import('pg'))).default
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const client = new Pool({ connectionString: url, max: poolSize })
    return { dialect, db: drizzle({ client }), ping: async () => void await client.query('select 1'), close: () => client.end() }
  }
  const { createPool } = await load('mysql2', () => import('mysql2/promise'))
  const { drizzle } = await import('drizzle-orm/mysql2')
  const client = createPool({ uri: url.replace(/^mariadb:/, 'mysql:'), connectionLimit: poolSize })
  return { dialect, db: drizzle({ client }), ping: async () => void await client.query('select 1'), close: () => client.end() }
}

/** libSQL doesn't create missing parent directories for a local file. */
async function ensureDir(path: string) {
  if (!path || path.startsWith(':memory:'))
    return
  const { mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(path.replace(/\?.*$/, '')), { recursive: true })
}
