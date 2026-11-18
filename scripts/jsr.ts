// Writes a jsr.json next to each public package's package.json for `jsr publish`: the same version, its
// built exports and files (JSR publishes what npm does; `nuxt-atelier` becomes `@nuxt-atelier/core`, since
// JSR names need a scope). Run by the release workflow, after `bun run build`, in a checkout it throws away.
// JSR builds the module graph on its server, without node_modules, from package.json's dependencies: their
// `catalog:` and `workspace:` versions are resolved here, as `bun pm pack` does for npm.
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDocs } from './pack'

const root = resolve(import.meta.dirname, '..')
type Exports = string | { import?: string, default?: string }
// entries JSR can't build: `nuxt-atelier/project` reaches the server runtime, which imports Nuxt's own
// aliases (`nuxt/server`) that only resolve in an app. It's the CLI's and devtools' API, on npm.
const NOT_ON_JSR: Record<string, string[]> = { 'nuxt-atelier': ['./project'] }
const { workspaces } = await Bun.file(join(root, 'package.json')).json()
const versions: Record<string, string> = {}
for (const dir of readdirSync(join(root, 'packages'))) {
  const { name, version } = await Bun.file(join(root, 'packages', dir, 'package.json')).json()
  versions[name] = version
}

/** A dependency's version as npm and JSR read it: `catalog:[name]` from the root's catalogs, `workspace:*|^|~` from the package. */
function resolveVersion(name: string, spec: string): string {
  let resolved: string | undefined = spec
  if (spec.startsWith('catalog:'))
    resolved = spec === 'catalog:' ? workspaces.catalog?.[name] : workspaces.catalogs?.[spec.slice(8)]?.[name]
  else if (spec.startsWith('workspace:'))
    resolved = versions[name] && `${spec.slice(10).replace('*', '')}${versions[name]}`
  if (!resolved || /^[~^]?$/.test(resolved))
    throw new Error(`${name}: can't resolve ${spec}`)
  return resolved
}

for (const dir of readdirSync(join(root, 'packages'))) {
  const cwd = join(root, 'packages', dir)
  const pkg = await Bun.file(join(cwd, 'package.json')).json()
  if (pkg.private)
    continue
  addDocs(cwd, pkg) // kept: the release job's checkout is thrown away
  for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    for (const [name, spec] of Object.entries((pkg[key] ?? {}) as Record<string, string>))
      pkg[key][name] = resolveVersion(name, spec)
  }
  delete pkg.devDependencies
  await Bun.write(join(cwd, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  const exports: Record<string, string> = {}
  for (const [path, target] of Object.entries((pkg.exports ?? { '.': pkg.main }) as Record<string, Exports>)) {
    const file = typeof target === 'string' ? target : target.import ?? target.default
    if (file && !path.includes('*') && !path.endsWith('package.json') && !NOT_ON_JSR[pkg.name]?.includes(path))
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
