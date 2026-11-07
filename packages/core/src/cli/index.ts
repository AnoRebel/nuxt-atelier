#!/usr/bin/env node
// The `atelier` command
import type { Dialect } from '../runtime/server/db/driver'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { connect } from '../runtime/server/db/driver'
import { allDrivers } from '../runtime/server/db/loaders'
import { applyProjectMigrations, generateMigration, loadProject, projectMigrationStatus, withMigrationLock } from './migrate'
import { exportToFile, importFromFile } from './transfer'

const USAGE = `Usage: atelier <command> [options]

Commands:
  migrate generate   write a migration for schema changes to server/atelier/migrations/<dialect>/
  migrate apply      apply pending migrations to the database
  migrate status     list applied and pending migrations
  export <file>      write all content to a portable archive (gzipped when <file> ends in .gz)
  import <file>      load an archive into an empty, migrated database (any engine)

Options:
  --root <dir>          the Nuxt app (default: current directory)
  --dialect <name>      generate for sqlite, postgres or mysql (default: from the database URL)
  --name <name>         migration name
  --drop <c>[.<field>]  confirm deleting a removed collection or field and its data (repeatable)
  --rename <c>.<old>=<new> | <old c>=<new c>
                        declare a renamed field or collection, keeping its data (repeatable)

The database URL comes from NUXT_ATELIER_DATABASE_URL or the atelier.database.url option.`

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string', default: process.cwd() },
      dialect: { type: 'string' },
      name: { type: 'string' },
      drop: { type: 'string', multiple: true },
      rename: { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [group, command] = positionals
  if (values.help || !command || !['migrate', 'export', 'import'].includes(group!)) {
    console.log(USAGE)
    return values.help ? 0 : 1
  }
  if (values.dialect && !['sqlite', 'postgres', 'mysql'].includes(values.dialect))
    throw new Error(`--dialect: expected sqlite, postgres or mysql`)

  const project = await loadProject(resolve(values.root))
  if (group === 'export' || group === 'import') {
    const driver = await connect(project.databaseUrl, { loaders: allDrivers })
    try {
      const counts = group === 'export'
        ? await exportToFile(driver, project.schema, resolve(command))
        : await importFromFile(driver, project.schema, resolve(command))
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      console.log(`${group === 'export' ? 'Exported' : 'Imported'} ${total} rows:\n${Object.entries(counts).map(([t, n]) => `  ${t}: ${n}`).join('\n')}`)
    }
    finally {
      await driver.close()
    }
  }
  else if (command === 'generate') {
    const folder = await withMigrationLock(project.databaseUrl, () => generateMigration(project, { dialect: values.dialect as Dialect | undefined, name: values.name, drop: values.drop, rename: values.rename }))
    console.log(folder ? `Wrote ${relative(process.cwd(), folder)}/migration.sql: review it and commit it.` : 'No schema changes.')
  }
  else if (command === 'apply') {
    const applied = await withMigrationLock(project.databaseUrl, () => applyProjectMigrations(project, values.dialect as Dialect | undefined))
    console.log(applied.length ? `Applied:\n${applied.map(n => `  ${n}`).join('\n')}` : 'Database is up to date.')
  }
  else if (command === 'status') {
    const { applied, pending } = await projectMigrationStatus(project)
    console.log(`Applied: ${applied.length}`)
    console.log(pending.length ? `Pending:\n${pending.map(n => `  ${n}`).join('\n')}` : 'Pending: none')
  }
  else {
    console.log(USAGE)
    return 1
  }
  return 0
}

// exit explicitly: database pools and drizzle-kit keep handles open
main().then(code => process.exit(code), (error: Error) => {
  console.error(process.env.ATELIER_DEBUG ? error : error.message)
  process.exit(1)
})
