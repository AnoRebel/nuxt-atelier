// `nuxt dev`: keep the dev database in step with the content schema. On start and whenever a definition
// changes, write a migration for the change and apply it. Changes that would lose data (a removed or
// renamed field) aren't applied: the developer confirms them with `atelier migrate generate --drop/--rename`.
// Without drizzle-kit, existing migrations are still applied.
import type { Nuxt } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { useLogger, writeTypes } from '@nuxt/kit'
import { applyProjectMigrations, DataLossError, generateMigration, MissingKitError, projectFromNuxt, withMigrationLock } from './migrate'

const DEFINITION = /(?:^|\/)atelier\/(?:(?:collections|singletons)\/|tables\.[mc]?[jt]s$)/

// One run at a time across the process: a quick second edit, or a Nuxt restart mid-run, waits for the
// current migration instead of generating the same one twice. On globalThis because a restart re-imports
// this module, which would give the new Nuxt instance its own queue.
const shared = globalThis as { atelierDevMigrations?: Promise<void>, atelierBlockedChanges?: string[] }

/** The schema change `nuxt dev` couldn't apply because it would lose data, with the flags that confirm it. */
export const blockedSchemaChanges = (): string[] => shared.atelierBlockedChanges ?? []

export function setupDevMigrations(nuxt: Nuxt): void {
  const logger = useLogger('nuxt-atelier')
  let warnedKit = false

  async function migrate() {
    // drizzle-kit loads the schema through the project's tsconfig.json, which extends .nuxt/tsconfig.json:
    // on a cold .nuxt, `ready` comes before Nuxt writes it, so write the types first (as Nuxt's build does)
    if (!existsSync(join(nuxt.options.buildDir, 'tsconfig.json')))
      await writeTypes(nuxt)
    const project = await projectFromNuxt(nuxt)
    await withMigrationLock(project.databaseUrl, () => migrateProject(project))
  }

  async function migrateProject(project: Awaited<ReturnType<typeof projectFromNuxt>>) {
    try {
      const folder = await generateMigration(project)
      shared.atelierBlockedChanges = []
      if (folder)
        logger.info(`Schema changed: wrote ${relative(project.rootDir, folder)}/migration.sql (commit it with your schema change)`)
    }
    catch (error) {
      if (error instanceof DataLossError) {
        shared.atelierBlockedChanges = error.suggestions
        logger.warn(`${error.message.replace('[nuxt-atelier] ', '')}\nThe dev database keeps the old shape until you run \`npx atelier migrate generate\` with one of those flags.`)
      }
      else if (error instanceof MissingKitError) {
        if (!warnedKit)
          logger.warn(`Schema changes aren't applied in dev without drizzle-kit (an optional dev dependency). ${error.message.split('\n').at(-1)!.trim()}`)
        warnedKit = true
      }
      else {
        throw error
      }
    }
    const applied = await applyProjectMigrations(project)
    if (applied.length)
      logger.success(`Applied to the dev database: ${applied.join(', ')}`)
  }

  const run = () => {
    shared.atelierDevMigrations = (shared.atelierDevMigrations ?? Promise.resolve())
      .then(migrate)
      .catch((error: Error) => logger.error(`Dev migration failed: ${error.message}`))
  }
  nuxt.hook('ready', run)
  // add/unlink restart Nuxt (see module.ts), which runs it again on ready
  nuxt.hook('builder:watch', (event, path) => {
    if (event === 'change' && DEFINITION.test(path))
      run()
  })
}
