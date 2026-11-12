// `atelier migrate generate|apply|status`
import type { Dialect } from '../runtime/server/db/driver'
import type { ContentSchema } from '../runtime/server/db/tables'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { open, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from '@nuxt/schema'
import { loadNuxt } from '@nuxt/kit'
import { createJiti } from 'jiti'
import { resolveOptions } from '../options'
import { connect, dialectOf } from '../runtime/server/db/driver'
import { applyMigrations, destructiveChanges, localMigrationNames, migrationsFolder, migrationStatus, rehearseMigrations } from '../runtime/server/db/migrations'
import { buildTables, collectionTable, publishedTable } from '../runtime/server/db/tables'
import { allDrivers } from '../runtime/server/db/loaders'
import { discoverSchema, layerFiles } from '../schema/discover'
import { serialiseFields } from '../runtime/shared/fields'
import { resolveLocales } from '../runtime/shared/locales'

const runtime = (path: string) => fileURLToPath(new URL(`../runtime/server/${path}`, import.meta.url))
const KIT_DIALECTS = { sqlite: 'sqlite', postgres: 'postgresql', mysql: 'mysql' } as const
const KIT_VERSION = '1.0.0-rc.5'

export interface Project {
  rootDir: string
  buildDir: string
  databaseUrl: string
  schema: ContentSchema
}

/** The app's database URL and content schema, from a loaded (not necessarily built) Nuxt instance. */
export async function projectFromNuxt(nuxt: Nuxt): Promise<Project> {
  const { rootDir, buildDir } = nuxt.options
  const options = resolveOptions((nuxt.options as unknown as { atelier?: never }).atelier ?? {})
  let databaseUrl = process.env.NUXT_ATELIER_DATABASE_URL || options.database.url
  const file = /^file:(?!\/)(.*)$/.exec(databaseUrl)?.[1] // relative SQLite paths are relative to the app
  if (file !== undefined && file !== ':memory:' && !isAbsolute(file))
    databaseUrl = `file:${join(rootDir, file)}`

  const jiti = createJiti(import.meta.url, { alias: { '#atelier/server': runtime('define') }, moduleCache: false })
  const load = async (kind: 'collections' | 'singletons') => Object.fromEntries(await Promise.all(
    [...discoverSchema(kind, nuxt)].map(async ([name, path]) => [name, await jiti.import(path, { default: true })]),
  ))
  const tables = Object.assign({}, ...await Promise.all(layerFiles('tables', nuxt).toReversed().map(path => jiti.import(path, { default: true }))))
  return { rootDir, buildDir, databaseUrl, schema: { collections: await load('collections'), singletons: await load('singletons'), tables, locales: resolveLocales(options.locales) } }
}

/**
 * Reads the app's config, layers and content schema without building it. Modules are set up (`ready`), so
 * definitions that plugin modules add (`atelier:dirs`) are read too.
 */
export async function loadProject(cwd: string): Promise<Project> {
  const nuxt = await loadNuxt({ cwd, ready: true, overrides: { logLevel: 'silent' } })
  try {
    return await projectFromNuxt(nuxt)
  }
  finally {
    await nuxt.close()
  }
}

/** A schema change that would lose data unless the developer confirms it. */
export class DataLossError extends Error {
  constructor(readonly changes: string[]) {
    super(`[nuxt-atelier] The schema change would lose data, so no migration was written:\n${[...new Set(changes.map(suggestion))].join('\n')}`)
  }
}

/** drizzle-kit, an optional peer dependency, isn't installed. */
export class MissingKitError extends Error {}

/** Collection-level names for a table change, as the --drop / --rename flags take them. */
const collectionOf = (table: string) => /^atelier_[cp]_/.test(table) ? table.slice('atelier_c_'.length).replaceAll('_', '-') : undefined

interface Rename {
  change: string
  hint: { kind: 'table' | 'column', from: string[], to: string[] }
  /** Atelier's own rows naming the old collection or field, updated in the same migration. */
  data: { marker: string, sql: string[] }
}

const literal = (value: string) => `'${value}'` // names and keys are [a-z0-9-] only: nothing to escape

function parseRename(flag: string, dialect: Dialect): Rename[] {
  const m = /^([a-z][a-z0-9-]*)(?:\.([a-z][a-z0-9]*))?=([a-z][a-z0-9-]*)$/i.exec(flag)
  if (!m)
    throw new Error(`--rename ${flag}: expected <collection>.<old field>=<new field> or <old collection>=<new collection>`)
  const [, collection, field, to] = m as unknown as [string, string, string | undefined, string]
  // a collection's drafts and its published copy rename together
  const pairs = [[collectionTable(collection), collectionTable(to)], [publishedTable(collection), publishedTable(to)]] as const
  if (!field) {
    const [from, into] = [literal(collection), literal(to)]
    return pairs.map(([table, renamed], i) => ({
      change: `rename table ${table} to ${renamed}`,
      hint: { kind: 'table', from: [table], to: [renamed] },
      data: {
        marker: `rename collection ${collection} to ${to}${i ? ' (published)' : ''}`,
        sql: (i ? ['atelier_p_relations', 'atelier_p_routes'] : ['atelier_relations', 'atelier_revisions', 'atelier_routes']).flatMap(t => [
          `UPDATE ${t} SET source = ${into} WHERE source = ${from};`,
          ...t.endsWith('relations') ? [`UPDATE ${t} SET target = ${into} WHERE target = ${from};`] : [],
        ]),
      },
    }))
  }
  // relation values (and nested ones, under `<field>.`) are stored by field path
  const rest = `substr(field, ${field.length + 1})`
  const path = dialect === 'mysql' ? `CONCAT(${literal(to)}, ${rest})` : `${literal(to)} || ${rest}`
  return pairs.map(([table], i) => ({
    change: `rename column ${table}.${field} to ${to}`,
    hint: { kind: 'column', from: [table, field], to: [table, to] },
    data: {
      marker: `rename field ${collection}.${field} to ${to}${i ? ' (published)' : ''}`,
      sql: [`UPDATE ${i ? 'atelier_p_relations' : 'atelier_relations'} SET field = ${path} WHERE source = ${literal(collection)} AND (field = ${literal(field)} OR field LIKE ${literal(`${field}.%`)});`],
    },
  }))
}

/** Renames the schema declares with `renamedFrom`, as --rename flags. Collection renames come first. */
function declaredRenames(schema: ContentSchema): string[] {
  const collections = Object.entries(schema.collections)
  return [
    ...collections.flatMap(([name, c]) => c.renamedFrom ? [`${c.renamedFrom}=${name}`] : []),
    ...collections.flatMap(([name, c]) => Object.entries(c.fields).flatMap(([key, f]) => f.renamedFrom ? [`${name}.${f.renamedFrom}=${key}`] : [])),
  ]
}

/** Data updates already written to a migration in `folder`. */
function writtenDataUpdates(folder: string): Set<string> {
  const markers = new Set<string>()
  for (const name of localMigrationNames(folder)) {
    const sql = readFileSync(join(folder, name, 'migration.sql'), 'utf8')
    for (const m of sql.matchAll(/^-- atelier:data (.+)$/gm))
      markers.add(m[1]!)
  }
  return markers
}

function parseDrop(flag: string) {
  const m = /^([a-z][a-z0-9-]*)(?:\.(\w+))?$/.exec(flag)
  if (!m)
    throw new Error(`--drop ${flag}: expected <collection>.<field> or <collection>`)
  return [collectionTable(m[1]!), publishedTable(m[1]!)].map(table => m[2] ? `drop column ${table}.${m[2]}` : `drop table ${table}`)
}

function suggestion(change: string): string {
  const m = /^drop (column|table) (\w+)(?:\.(\w+))?$/.exec(change)
  const collection = m && collectionOf(m[2]!)
  if (!m || !collection)
    return `  ${change}`
  const target = m[1] === 'column' ? `${collection}.${m[3]}` : collection
  const renamed = m[1] === 'column' ? `${collection}.${m[3]}=<new field>` : `${collection}=<new collection>`
  return `  ${change}: pass --drop ${target} to delete its data, or --rename ${renamed} if it was renamed`
}

async function importKit() {
  try {
    return await import('drizzle-kit/cli')
  }
  catch (error) {
    throw new MissingKitError(`[nuxt-atelier] Generating migrations needs drizzle-kit, an optional dependency. Install it as a dev dependency:\n  npm i -D drizzle-kit@${KIT_VERSION}`, { cause: error })
  }
}

export interface GenerateOptions {
  dialect?: Dialect
  name?: string
  drop?: string[]
  rename?: string[]
}

/**
 * Writes a migration for the difference between the schema and the last migration.
 * Returns its folder, or undefined when nothing changed. A drop or rename the flags don't confirm
 * removes the migration again and throws, naming the flags to pass.
 */
export async function generateMigration(project: Project, options: GenerateOptions = {}): Promise<string | undefined> {
  const kit = await importKit()
  const dialect = options.dialect ?? dialectOf(project.databaseUrl)
  const flags = [...new Set([...declaredRenames(project.schema), ...options.rename ?? []])]
  const renames = flags.flatMap(flag => parseRename(flag, dialect))
    .toSorted((a, b) => Number(a.hint.kind === 'column') - Number(b.hint.kind === 'column'))
  const confirmed = new Set([...(options.drop ?? []).flatMap(parseDrop), ...renames.map(r => r.change)])

  // drizzle-kit reads tables from a module's top-level exports
  const tables = Object.keys(buildTables(dialect, project.schema))
  const schemaModule = join(project.buildDir, 'atelier', `tables.${dialect}.ts`)
  mkdirSync(dirname(schemaModule), { recursive: true })
  const schema = serialiseFields(project.schema)
  writeFileSync(schemaModule, `// Generated by \`atelier migrate generate\`
import { buildTables } from ${JSON.stringify(runtime('db/tables'))}
const t = buildTables(${JSON.stringify(dialect)}, ${schema})
${tables.map((name, i) => `export const t${i} = t[${JSON.stringify(name)}]`).join('\n')}
`)

  const out = migrationsFolder(project.rootDir, dialect)
  const written = writtenDataUpdates(out)
  const dataUpdates = renames.map(r => r.data).filter(d => !written.has(d.marker))
  const run = (hints?: Parameters<typeof kit.generate>[0]['hints'], custom?: boolean) =>
    kit.generate({ dialect: KIT_DIALECTS[dialect], schema: schemaModule, out, name: options.name, hints, custom })
  let result = await run()
  if (result.status === 'missing_hints') {
    // drizzle-kit asks whether a new table or column is a renamed one: yes when a --rename says so
    const hints = result.unresolved.map((item) => {
      if (item.type !== 'rename_or_create')
        throw new Error(`[nuxt-atelier] drizzle-kit needs a decision we can't make: ${JSON.stringify(item)}`)
      const [prefix, ...entity] = item.entity as readonly string[]
      const rename = renames.find(r => r.hint.kind === item.kind && r.hint.to.join('.') === entity.join('.'))
      return rename
        ? { type: 'rename', kind: item.kind, from: [prefix, ...rename.hint.from], to: item.entity }
        : { type: 'create', kind: item.kind, entity: item.entity }
    })
    result = await run(hints as never)
  }
  if (result.status === 'no_changes') {
    if (!dataUpdates.length)
      return undefined
    result = await run(undefined, true) // a renamed relation has no column: the data update is the whole migration
  }
  if (result.status !== 'ok' || !('migration_path' in result))
    throw new Error(`[nuxt-atelier] drizzle-kit generate failed: ${JSON.stringify(result)}`)

  const folder = dirname(join(result.migration_path))
  const file = join(folder, 'migration.sql')
  const sql = readFileSync(file, 'utf8')
  const changes = destructiveChanges(sql)
  const unconfirmed = changes.filter(c => !confirmed.has(c))
  if (unconfirmed.length) {
    rmSync(folder, { recursive: true })
    throw new DataLossError(unconfirmed)
  }
  const confirmations = changes.map(c => `-- atelier:confirm ${c}\n`).join('')
  const updates = dataUpdates.map(d => `-- atelier:data ${d.marker}\n${d.sql.join('\n--> statement-breakpoint\n')}`)
  const body = sql.trim() && !sql.trimStart().startsWith('-- Custom SQL') ? [sql.trimEnd(), ...updates] : updates
  writeFileSync(file, `${confirmations}${body.join('\n--> statement-breakpoint\n')}\n`)
  return folder
}

export async function applyProjectMigrations(project: Project, dialect = dialectOf(project.databaseUrl)) {
  const driver = await connect(project.databaseUrl, { loaders: allDrivers })
  try {
    return await applyMigrations(driver, migrationsFolder(project.rootDir, dialect))
  }
  finally {
    await driver.close()
  }
}

/** `migrate apply --dry-run`: the pending migrations rehearsed and rolled back. */
export async function rehearseProjectMigrations(project: Project, dialect = dialectOf(project.databaseUrl)) {
  const driver = await connect(project.databaseUrl, { loaders: allDrivers })
  try {
    return await rehearseMigrations(driver, migrationsFolder(project.rootDir, dialect))
  }
  finally {
    await driver.close()
  }
}

export async function projectMigrationStatus(project: Project) {
  const driver = await connect(project.databaseUrl, { loaders: allDrivers })
  try {
    return await migrationStatus(driver, localMigrationNames(migrationsFolder(project.rootDir, driver.dialect)))
  }
  finally {
    await driver.close()
  }
}

const STALE_LOCK = 120_000

/**
 * Runs `fn` while holding a lock on the database, across processes: `nuxt dev` and `atelier migrate`
 * (or two Nuxt processes for the same app) never generate or apply migrations at the same time.
 */
export async function withMigrationLock<T>(databaseUrl: string, fn: () => Promise<T>): Promise<T> {
  const file = join(tmpdir(), `nuxt-atelier-${createHash('sha256').update(databaseUrl).digest('hex').slice(0, 16)}.lock`)
  for (;;) {
    try {
      await (await open(file, 'wx')).close()
      break
    }
    catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST')
        throw error
      const age = Date.now() - ((await stat(file).catch(() => undefined))?.mtimeMs ?? 0)
      if (age > STALE_LOCK) // left by a crashed process
        await rm(file, { force: true })
      else
        await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  try {
    return await fn()
  }
  finally {
    await rm(file, { force: true })
  }
}
