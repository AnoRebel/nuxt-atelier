// Writes a jsr.json next to each public package's package.json for `jsr publish`: the same version, its
// built exports and files (JSR publishes what npm does; `nuxt-atelier` becomes `@nuxt-atelier/core`, since
// JSR names need a scope). Run by the release workflow, after `bun run build`, in a checkout it throws away.
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDocs } from './pack'

const root = resolve(import.meta.dirname, '..')
type Exports = string | { import?: string, default?: string }

for (const dir of readdirSync(join(root, 'packages'))) {
  const cwd = join(root, 'packages', dir)
  const pkg = await Bun.file(join(cwd, 'package.json')).json()
  if (pkg.private)
    continue
  addDocs(cwd, pkg) // kept: the release job's checkout is thrown away
  const exports: Record<string, string> = {}
  for (const [path, target] of Object.entries((pkg.exports ?? { '.': pkg.main }) as Record<string, Exports>)) {
    const file = typeof target === 'string' ? target : target.import ?? target.default
    if (file && !path.includes('*') && !path.endsWith('package.json'))
      exports[path] = file
  }
  await Bun.write(join(cwd, 'jsr.json'), `${JSON.stringify({
    name: pkg.name === 'nuxt-atelier' ? '@nuxt-atelier/core' : pkg.name,
    version: pkg.version,
    license: 'MIT',
    exports,
    publish: { include: [...(pkg.files ?? []), 'LICENSE', 'README.md'] },
  }, null, 2)}\n`)
  console.log(`${pkg.name}: jsr.json`)
}
