// Production: are the bundled migrations applied? Checked once at startup (plugins/migrations.ts).
// Pending migrations are applied when `migrations.autoApply` is on; otherwise they're logged and
// CMS writes refuse with a 503 until `atelier migrate apply` runs. Dev applies its own (src/cli/dev.ts).
import type { AtelierDriver } from './driver'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrations } from '#atelier-migrations'
import { createError, useRuntimeConfig } from 'nuxt/server'
import { applyMigrationList, applyMigrations, migrationStatus } from './migrations'

let check: Promise<string[]> | undefined

/** drizzle-orm's migrator reads a folder: lay the bundled migrations out in a temporary one. */
async function applyBundled(driver: AtelierDriver, bundled: { name: string, sql: string }[]): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'atelier-migrations-'))
  try {
    for (const { name, sql } of bundled) {
      await mkdir(join(folder, name))
      await writeFile(join(folder, name, 'migration.sql'), sql)
    }
    return await applyMigrations(driver, folder)
  }
  finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/** The bundled migrations the database hasn't applied, after applying them when `autoApply` is on. */
export function pendingMigrations(driver: () => Promise<AtelierDriver>): Promise<string[]> {
  check ??= (async () => {
    const db = await driver()
    const bundled = migrations[db.dialect] ?? []
    const { pending } = await migrationStatus(db, bundled.map(m => m.name))
    if (!pending.length)
      return []
    if (useRuntimeConfig().atelier.migrations.autoApply) {
      // D1 (no transactions, no filesystem) applies them as one batch
      const applied = db.capabilities.transactions ? await applyBundled(db, bundled) : await applyMigrationList(db, bundled)
      console.info(`[nuxt-atelier] Applied migrations: ${applied.join(', ')}`)
      return []
    }
    console.error(`[nuxt-atelier] The database has pending migrations, so CMS writes are refused until they're applied:\n${pending.map(n => `  ${n}`).join('\n')}\nRun \`atelier migrate apply\`, or set NUXT_ATELIER_MIGRATIONS_AUTO_APPLY=true.`)
    return pending
  })().catch((error) => {
    check = undefined // retry on the next write, e.g. once the database is reachable
    throw error
  })
  return check
}

/** Throws a 503 when migrations are pending. Every CMS write calls this first. */
export async function assertMigrated(driver: () => Promise<AtelierDriver>): Promise<void> {
  if (import.meta.dev)
    return
  const pending = await pendingMigrations(driver)
  if (pending.length) {
    throw createError({
      status: 503,
      message: `The database has ${pending.length} pending migration${pending.length === 1 ? '' : 's'} (${pending.join(', ')}). Run \`atelier migrate apply\`.`,
    })
  }
}
