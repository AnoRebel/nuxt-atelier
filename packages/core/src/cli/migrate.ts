// `atelier migrate generate|apply|status`
import type { Dialect } from '../runtime/server/db/driver'
import type { ContentSchema } from '../runtime/server/db/tables'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { createJiti } from 'jiti'
import { resolveOptions } from '../options'
import { connect, dialectOf } from '../runtime/server/db/driver'
import { applyMigrations, destructiveChanges, migrationsFolder, migrationStatus } from '../runtime/server/db/migrations'
import { buildTables, collectionTable } from '../runtime/server/db/tables'
import { discoverSchema } from '../schema/discover'

const runtime = (path: string) => fileURLToPath(new URL(`../runtime/server/${path}`, import.meta.url))
const KIT_DIALECTS = { sqlite: 'sqlite', postgres: 'postgresql', mysql: 'mysql' } as const
const KIT_VERSION = '1.0.0-rc.5'

export interface Project {
  rootDir: string
  buildDir: string
  databaseUrl: string
  schema: ContentSchema
}

/** Reads the app's config, layers and content schema without building it. */
export async function loadProject(cwd: string): Promise<Project> {
  const nuxt = await loadNuxt({ cwd, ready: false, overrides: { logLevel: 'silent' } })
  try {
    const { rootDir, buildDir } = nuxt.options
    const options = resolveOptions((nuxt.options as { atelier?: never }).atelier ?? {})
    let databaseUrl = process.env.NUXT_ATELIER_DATABASE_URL || options.database.url
    const file = /^file:(?!\/)(.*)$/.exec(databaseUrl)?.[1] // relative SQLite paths are relative to the app
    if (file !== undefined && file !== ':memory:' && !isAbsolute(file))
      databaseUrl = `file:${join(rootDir, file)}`

    const jiti = createJiti(import.meta.url, { alias: { '#atelier/server': runtime('define') }, moduleCache: false })
    const load = async (kind: 'collections' | 'singletons') => Object.fromEntries(await Promise.all(
      [...discoverSchema(kind, nuxt)].map(async ([name, path]) => [name, await jiti.import(path, { default: true })]),
    ))
    return { rootDir, buildDir, databaseUrl, schema: { collections: await load('collections'), singletons: await load('singletons') } }
  }
  finally {
    await nuxt.close()
  }
}

/** Collection-level names for a table change, as the --drop / --rename flags take them. */
const collectionOf = (table: string) => table.startsWith('atelier_c_') ? table.slice('atelier_c_'.length).replaceAll('_', '-') : undefined

function parseRename(flag: string) {
  const m = /^([a-z][a-z0-9-]*)(?:\.(\w+))?=(\w[\w-]*)$/.exec(flag)
  if (!m)
    throw new Error(`--rename ${flag}: expected <collection>.<old field>=<new field> or <old collection>=<new collection>`)
  const [, collection, field, to] = m as unknown as [string, string, string | undefined, string]
  const table = collectionTable(collection)
  return field
    ? { change: `rename column ${table}.${field} to ${to}`, hint: { kind: 'column', from: [table, field], to: [table, to] } }
    : { change: `rename table ${table} to ${collectionTable(to)}`, hint: { kind: 'table', from: [table], to: [collectionTable(to)] } }
}

function parseDrop(flag: string) {
  const m = /^([a-z][a-z0-9-]*)(?:\.(\w+))?$/.exec(flag)
  if (!m)
    throw new Error(`--drop ${flag}: expected <collection>.<field> or <collection>`)
  return m[2] ? `drop column ${collectionTable(m[1]!)}.${m[2]}` : `drop table ${collectionTable(m[1]!)}`
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
    throw new Error(`[nuxt-atelier] Generating migrations needs drizzle-kit, an optional dependency. Install it as a dev dependency:\n  npm i -D drizzle-kit@${KIT_VERSION}`, { cause: error })
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
  const renames = (options.rename ?? []).map(parseRename)
  const confirmed = new Set([...(options.drop ?? []).map(parseDrop), ...renames.map(r => r.change)])

  // drizzle-kit reads tables from a module's top-level exports
  const tables = Object.keys(buildTables(dialect, project.schema))
  const schemaModule = join(project.buildDir, 'atelier', `tables.${dialect}.ts`)
  mkdirSync(dirname(schemaModule), { recursive: true })
  const schema = JSON.stringify(project.schema, (key, value) => key === 'validate' ? undefined : value)
  writeFileSync(schemaModule, `// Generated by \`atelier migrate generate\`
import { buildTables } from ${JSON.stringify(runtime('db/tables'))}
const t = buildTables(${JSON.stringify(dialect)}, ${schema})
${tables.map((name, i) => `export const t${i} = t[${JSON.stringify(name)}]`).join('\n')}
`)

  const out = migrationsFolder(project.rootDir, dialect)
  const run = (hints?: Parameters<typeof kit.generate>[0]['hints']) =>
    kit.generate({ dialect: KIT_DIALECTS[dialect], schema: schemaModule, out, name: options.name, hints })
  let result = await run()
  if (result.status === 'missing_hints') {
    // drizzle-kit asks whether a new table or column is a renamed one: yes when a --rename says so
    const hints = result.unresolved.map((item) => {
      if (item.type !== 'rename_or_create')
        throw new Error(`[nuxt-atelier] drizzle-kit needs a decision we can't make: ${JSON.stringify(item)}`)
      const [prefix, ...entity] = item.entity as string[]
      const rename = renames.find(r => r.hint.kind === item.kind && r.hint.to.join('.') === entity.join('.'))
      return rename
        ? { type: 'rename', kind: item.kind, from: [prefix, ...rename.hint.from], to: item.entity }
        : { type: 'create', kind: item.kind, entity: item.entity }
    })
    result = await run(hints as never)
  }
  if (result.status === 'no_changes')
    return undefined
  if (result.status !== 'ok' || !('migration_path' in result))
    throw new Error(`[nuxt-atelier] drizzle-kit generate failed: ${JSON.stringify(result)}`)

  const folder = dirname(join(result.migration_path))
  const file = join(folder, 'migration.sql')
  const sql = readFileSync(file, 'utf8')
  const changes = destructiveChanges(sql)
  const unconfirmed = changes.filter(c => !confirmed.has(c))
  if (unconfirmed.length) {
    rmSync(folder, { recursive: true })
    throw new Error(`[nuxt-atelier] The schema change would lose data, so no migration was written:\n${unconfirmed.map(suggestion).join('\n')}`)
  }
  if (changes.length)
    writeFileSync(file, `${changes.map(c => `-- atelier:confirm ${c}`).join('\n')}\n${sql}`)
  return folder
}

export async function applyProjectMigrations(project: Project, dialect = dialectOf(project.databaseUrl)) {
  const driver = await connect(project.databaseUrl)
  try {
    return await applyMigrations(driver, migrationsFolder(project.rootDir, dialect))
  }
  finally {
    await driver.close()
  }
}

export async function projectMigrationStatus(project: Project) {
  const driver = await connect(project.databaseUrl)
  try {
    return await migrationStatus(driver, migrationsFolder(project.rootDir, driver.dialect))
  }
  finally {
    await driver.close()
  }
}
