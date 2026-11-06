// Creates the Atelier tables in a test database with drizzle-kit's push.
// Runs in a child process: the kit SDK leaves its connection pool open.
//   bun test/storage/push.ts <dialect> <url> <schema.json>
//   bun test/storage/push.ts sqlite export <schema.json>   prints the CREATE statements as JSON (for D1)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportSql, push } from 'drizzle-kit/cli'

const KIT_DIALECT = { sqlite: 'sqlite', postgres: 'postgresql', mysql: 'mysql' } as const
const tablesModule = fileURLToPath(new URL('../../packages/core/src/runtime/server/db/tables.ts', import.meta.url))

const [dialect, url, schemaFile] = process.argv.slice(2) as [keyof typeof KIT_DIALECT, string, string]
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
const { buildTables } = await import(tablesModule)
const names = Object.keys(buildTables(dialect, schema))

// drizzle-kit collects tables from a module's top-level exports
const module = join(schemaFile, '..', `tables-${dialect}.ts`)
writeFileSync(module, `import { buildTables } from ${JSON.stringify(tablesModule)}
const t = buildTables(${JSON.stringify(dialect)}, ${JSON.stringify(schema)})
${names.map((name, i) => `export const t${i} = t[${JSON.stringify(name)}]`).join('\n')}
`)
if (url === 'export') {
  const exported = await exportSql({ dialect: KIT_DIALECT[dialect], schema: module })
  if (exported.status !== 'ok')
    throw new Error(JSON.stringify(exported))
  console.log(JSON.stringify(exported.statements))
  process.exit(0)
}
const result = await push({ dialect: KIT_DIALECT[dialect], schema: module, url: url.replace(/^mariadb:/, 'mysql:'), force: true })
console.log(JSON.stringify(result))
process.exit(result.status === 'ok' || result.status === 'no_changes' ? 0 : 1)
