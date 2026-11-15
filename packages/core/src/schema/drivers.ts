import { tryResolveModule } from '@nuxt/kit'

/**
 * The `#atelier-drivers` server module: a loader for each database driver the app can resolve, so the
 * server bundle never includes a driver that isn't installed. A `d1:` build includes only D1: Workers
 * can't run the Node drivers, and bundling them fails.
 *
 * A package the app resolves itself is imported by name, so the bundler picks the platform's build of it (a
 * Worker's `workerd` one, say). One only Nuxt Atelier sees (Bun's or pnpm's isolated installs) is imported by
 * its resolved file: a virtual module has no place on disk to resolve a name from, and Nuxt 5's server build
 * (Rolldown) resolves it from the app.
 */
export async function driversTemplate(rootDir: string, databaseUrl: string): Promise<string> {
  const at = async (pkg: string) => await tryResolveModule(pkg, [rootDir]) ? pkg : tryResolveModule(pkg, [import.meta.url])
  /** `() => Promise.all([import(…), …])` of every package, or undefined when one isn't installed. */
  const loader = async (...pkgs: string[]) => {
    const files = await Promise.all(pkgs.map(at))
    return files.every(Boolean) ? `() => Promise.all([${files.map(file => `import(${JSON.stringify(file)})`).join(', ')}])` : undefined
  }
  const d1 = await at('drizzle-orm/d1')
  const loaders: string[] = [`  d1: () => import(${JSON.stringify(d1 ?? 'drizzle-orm/d1')}),`]
  if (!databaseUrl.startsWith('d1:')) {
    for (const [name, pkgs] of [['libsql', ['@libsql/client', 'drizzle-orm/libsql']], ['pg', ['pg', 'drizzle-orm/node-postgres']], ['mysql2', ['mysql2/promise', 'drizzle-orm/mysql2']]] as const) {
      const load = await loader(...pkgs)
      if (load)
        loaders.push(`  ${name}: ${load},`)
    }
  }
  return `export const drivers = {\n${loaders.join('\n')}\n}\n`
}
