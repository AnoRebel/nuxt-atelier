// Every runtime dependency (and peer) of a published package must be listed, with what it's for, on the
// dependencies page of the docs: a new one needs a reason written down. Unused ones are knip's to find.
//   bun run deps
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
export const PAGE = join(root, 'docs/content/3.reference/23.dependencies.md')

/** The dependencies of public packages missing from `page`, as `<package>: <dependency>`. */
export async function undocumented(page: string): Promise<string[]> {
  const listed = new Set([...page.matchAll(/`([^`]+)`/g)].map(m => m[1]!))
  const missing: string[] = []
  for (const dir of readdirSync(join(root, 'packages'))) {
    const pkg = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'))
    if (pkg.private)
      continue
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (!listed.has(name))
        missing.push(`${pkg.name}: ${name}`)
    }
  }
  return missing
}

if (import.meta.main) {
  const missing = await undocumented(readFileSync(PAGE, 'utf8'))
  if (missing.length) {
    console.error(`Dependencies not listed in docs/content/3.reference/23.dependencies.md, with what they're for:\n${missing.map(m => `  ${m}`).join('\n')}`)
    process.exit(1)
  }
  console.log('Every dependency is documented.')
}
