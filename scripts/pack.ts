// Packs every public package with `bun pm pack` (which resolves `catalog:` and `workspace:` versions) into
// a directory, and fails if a tarball's package.json still holds one: npm would publish it unusable.
// Each tarball gets the root LICENSE (MIT needs its notice shipped), and a README: core gets the root one,
// a package without its own a pointer to the docs. The release workflow publishes these tarballs.
// `bun run pack [dir]` (default `.packs`), after `bun run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
/** Adds the LICENSE and a README to a package that has none; returns the files added. */
export function addDocs(cwd: string, pkg: { name: string, description?: string }) {
  const added = [join(cwd, 'LICENSE'), join(cwd, 'README.md')].filter(file => !existsSync(file))
  if (added.includes(join(cwd, 'LICENSE')))
    copyFileSync(join(root, 'LICENSE'), join(cwd, 'LICENSE'))
  if (added.includes(join(cwd, 'README.md'))) {
    if (pkg.name === 'nuxt-atelier')
      copyFileSync(join(root, 'README.md'), join(cwd, 'README.md'))
    else
      writeFileSync(join(cwd, 'README.md'), `# ${pkg.name}\n\n${pkg.description ?? ''}\n\nPart of [Nuxt Atelier](https://nuxt-atelier.anorebel.net), a visual CMS for Nuxt. See the [documentation](https://nuxt-atelier.anorebel.net) to get started, or try the [live demo](https://nuxt-atelier-demo.anorebel.net).\n\nMIT License\n`)
  }
  return added
}

if (import.meta.main) {
  const out = resolve(process.argv[2] ?? join(root, '.packs'))
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  const UNRESOLVED = /"(?:catalog|workspace):/
  const failures: string[] = []
  for (const dir of readdirSync(join(root, 'packages'))) {
    const cwd = join(root, 'packages', dir)
    const pkg = await Bun.file(join(cwd, 'package.json')).json()
    if (pkg.private)
      continue
    const added = addDocs(cwd, pkg)
    const packed = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', out, '--quiet'], { cwd })
    for (const file of added)
      rmSync(file)
    if (packed.exitCode) {
      failures.push(`${pkg.name}: bun pm pack failed\n${packed.stderr}`)
      continue
    }
    const tarball = join(out, packed.stdout.toString().trim().split('\n').pop()!.split('/').pop()!)
    const manifest = Bun.spawnSync(['tar', '-xOzf', tarball, 'package/package.json']).stdout.toString()
    if (UNRESOLVED.test(manifest))
      failures.push(`${pkg.name}: ${manifest.match(new RegExp(`.*${UNRESOLVED.source}.*`, 'g'))!.join(', ').trim()}`)
    else
      console.log(`${pkg.name}@${pkg.version}  ${tarball}`)
  }

  if (failures.length) {
    console.error(`\nUnpublishable tarballs:\n${failures.map(f => `  ${f}`).join('\n')}`)
    process.exit(1)
  }
}
