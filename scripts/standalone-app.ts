// A copy of the playground as someone's own app would be: outside the workspace, with Nuxt Atelier installed
// from its packed tarballs (`bun run pack`) instead of the registry. What the deployment smoke tests
// (test/deploy) build with the hosting guides' own files, and the release's fresh-app install check.
//   bun scripts/standalone-app.ts [dir] [--example <dir>] [--with <package>[,…]] [--dialects <dialect>[,…]]
// (after `bun run build` and `bun run pack`). --example copies a hosting guide's files in (its nuxt.config.ts
// replaces the playground's); --with adds packages its config needs: a Nuxt Atelier package from .packs, or
// another at the version the workspace catalogs pin (else the latest). It generates the app's first migration
// (--dialects sqlite,postgres; default sqlite), as an app commits them from development.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const PACKS = join(root, '.packs')
const EXAMPLES = join(root, 'examples', 'hosting')

export interface StandaloneOptions {
  /** A directory of examples/hosting whose files are copied into the app. */
  example?: string
  /** Packages to add: Nuxt Atelier's from their tarballs, others from the registry. */
  packages?: string[]
  /** Where the tarballs are served over HTTP (a container build can't reach them on this disk): `file:` paths otherwise. */
  packsUrl?: string
  /** The dialects to generate the first migration for, as an app commits them from development (default sqlite). */
  dialects?: ('sqlite' | 'postgres' | 'mysql')[]
}

/** Where each package's tarball is installed from, by name. */
function tarballs(packsUrl?: string): Record<string, string> {
  if (!existsSync(PACKS))
    throw new Error('No .packs/: run `bun run build && bun run pack` first')
  const names: Record<string, string> = { 'nuxt-atelier': 'nuxt-atelier' }
  return Object.fromEntries(readdirSync(PACKS).filter(f => f.endsWith('.tgz')).map((file) => {
    const base = file.replace(/-\d+\.\d+\.\d+(?:-[\w.]+)?\.tgz$/, '')
    const name = names[base] ?? `@nuxt-atelier/${base.replace(/^nuxt-atelier-/, '')}`
    return [name, packsUrl ? `${packsUrl.replace(/\/$/, '')}/${file}` : `file:${join(PACKS, file)}`]
  }))
}

/** Runs a command to its end, its output shown (not blocking: the tarballs may be served from this process). */
function exec(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((done, fail) => spawn(command, args, { cwd, stdio: 'inherit' }).on('error', fail).on('exit', code =>
    code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed in ${cwd}`))))
}

/** The version the workspace catalogs pin a package at, or `latest`. */
function catalogVersion(name: string, workspaces: { catalog: Record<string, string>, catalogs: Record<string, Record<string, string>> }): string {
  return [workspaces.catalog, ...Object.values(workspaces.catalogs)].find(c => c[name])?.[name] ?? 'latest'
}

/** Creates the app in `dir` and installs it. */
export async function createStandaloneApp(dir: string, options: StandaloneOptions = {}): Promise<void> {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const entry of ['app', 'server', 'nuxt.config.ts'])
    cpSync(join(root, 'playground', entry), join(dir, entry), { recursive: true })
  if (options.example) {
    const example = join(EXAMPLES, options.example)
    if (!existsSync(example))
      throw new Error(`No examples/hosting/${options.example}`)
    cpSync(example, dir, { recursive: true })
  }
  const packs = tarballs(options.packsUrl)
  const { workspaces } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const dependencies: Record<string, string> = {
    'nuxt': workspaces.catalog.nuxt,
    'nuxt-atelier': packs['nuxt-atelier']!,
    '@nuxt-atelier/admin': packs['@nuxt-atelier/admin']!,
    '@nuxt-atelier/editor': packs['@nuxt-atelier/editor']!,
  }
  for (const name of options.packages ?? [])
    dependencies[name] = packs[name] ?? catalogVersion(name, workspaces)
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: 'my-site',
    private: true,
    type: 'module',
    scripts: { build: 'nuxt build', start: 'node .output/server/index.mjs' },
    dependencies,
    devDependencies: { 'drizzle-kit': workspaces.catalogs.db['drizzle-kit'] }, // for `atelier migrate generate`
    // the packages depend on each other by version: those come from the tarballs too, not the registry
    overrides: packs,
  }, null, 2)}\n`)
  await exec('bun', ['install'], dir)
  for (const dialect of options.dialects ?? ['sqlite']) {
    await exec(join(dir, 'node_modules/.bin/atelier'), ['migrate', 'generate', '--dialect', dialect], dir)
  }
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { example: { type: 'string' }, with: { type: 'string' }, dialects: { type: 'string' } } })
  const dir = resolve(positionals[0] ?? join(root, '.standalone'))
  await createStandaloneApp(dir, { example: values.example, packages: values.with?.split(',').filter(Boolean), dialects: values.dialects?.split(',').filter(Boolean) as StandaloneOptions['dialects'] })
  console.log(`A standalone app in ${dir}`)
}
