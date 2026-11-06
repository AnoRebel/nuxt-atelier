// Every driver, for the CLI and tests. A Nuxt build uses `#atelier-drivers` instead (only installed drivers).
import type { DriverLoaders } from './driver'

export const allDrivers: DriverLoaders = {
  libsql: () => Promise.all([import('@libsql/client'), import('drizzle-orm/libsql')]),
  pg: () => Promise.all([import('pg'), import('drizzle-orm/node-postgres')]),
  mysql2: () => Promise.all([import('mysql2/promise'), import('drizzle-orm/mysql2')]),
  d1: () => import('drizzle-orm/d1'),
}
