import { tryResolveModule } from '@nuxt/kit'

/**
 * The `#atelier-drivers` server module: a loader for each database driver the app can resolve, so the
 * server bundle never includes a driver that isn't installed. A `d1:` build includes only D1: Workers
 * can't run the Node drivers, and bundling them fails.
 */
export async function driversTemplate(rootDir: string, databaseUrl: string): Promise<string> {
  const loaders: string[] = [`  d1: () => import('drizzle-orm/d1'),`]
  if (!databaseUrl.startsWith('d1:')) {
    const has = async (pkg: string) => !!await tryResolveModule(pkg, [rootDir, import.meta.url])
    if (await has('@libsql/client'))
      loaders.push(`  libsql: () => Promise.all([import('@libsql/client'), import('drizzle-orm/libsql')]),`)
    if (await has('pg'))
      loaders.push(`  pg: () => Promise.all([import('pg'), import('drizzle-orm/node-postgres')]),`)
    if (await has('mysql2'))
      loaders.push(`  mysql2: () => Promise.all([import('mysql2/promise'), import('drizzle-orm/mysql2')]),`)
  }
  return `export const drivers = {\n${loaders.join('\n')}\n}\n`
}
