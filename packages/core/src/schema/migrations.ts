import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function list(dir: string): string[] {
  try {
    return readdirSync(dir).toSorted()
  }
  catch {
    return []
  }
}

/** The `#atelier-migrations` server module: every migration under server/atelier/migrations/<dialect>/, oldest first. */
export function migrationsTemplate(rootDir: string): string {
  const root = join(rootDir, 'server', 'atelier', 'migrations')
  const migrations = Object.fromEntries(list(root).map(dialect => [dialect, list(join(root, dialect)).map(name => ({
    name,
    sql: readFileSync(join(root, dialect, name, 'migration.sql'), 'utf8'),
  }))]))
  return `export const migrations = ${JSON.stringify(migrations)}\n`
}
