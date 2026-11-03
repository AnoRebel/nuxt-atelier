#!/usr/bin/env node
// The `atelier` command
import type { Dialect } from '../runtime/server/db/driver'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { applyProjectMigrations, generateMigration, loadProject, projectMigrationStatus } from './migrate'

const USAGE = `Usage: atelier migrate <command> [options]

Commands:
  generate   write a migration for schema changes to server/atelier/migrations/<dialect>/
  apply      apply pending migrations to the database
  status     list applied and pending migrations

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
  if (values.help || group !== 'migrate' || !command) {
    console.log(USAGE)
    return values.help ? 0 : 1
  }
  if (values.dialect && !['sqlite', 'postgres', 'mysql'].includes(values.dialect))
    throw new Error(`--dialect: expected sqlite, postgres or mysql`)

  const project = await loadProject(resolve(values.root))
  if (command === 'generate') {
    const folder = await generateMigration(project, { dialect: values.dialect as Dialect | undefined, name: values.name, drop: values.drop, rename: values.rename })
    console.log(folder ? `Wrote ${relative(process.cwd(), folder)}/migration.sql: review it and commit it.` : 'No schema changes.')
  }
  else if (command === 'apply') {
    const applied = await applyProjectMigrations(project, values.dialect as Dialect | undefined)
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
