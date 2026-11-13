import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const storage = 'test/storage/**/*.test.ts'
// third-party compatibility checks that may fail without it being ours to fix: a CI job of their own, not gating
const compat = 'test/compat/**/*.test.ts'

export default defineConfig({
  // the admin's composables import Nuxt's and the core's aliases: unit tests get stand-ins
  resolve: {
    alias: {
      '#imports': fileURLToPath(new URL('./test/admin/stubs/imports.ts', import.meta.url)),
      '#atelier-admin-pages': fileURLToPath(new URL('./test/admin/stubs/pages.ts', import.meta.url)),
      '#atelier-admin-languages': fileURLToPath(new URL('./test/admin/stubs/languages.ts', import.meta.url)),
      '#atelier/shared': fileURLToPath(new URL('./packages/core/src/runtime/shared', import.meta.url)),
    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // each e2e file builds a Nuxt app, and @nuxt/test-utils allows a build 120s: too many at once overrun it
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['scripts/**/*.test.ts', 'test/**/*.test.ts'], exclude: [storage, compat, '**/node_modules/**'], sequence: { groupOrder: 0 } },
      },
      {
        // the storage files share the test databases (test/compose.yml) and reset them: one file at a time,
        // after the unit project, so their dev server and builds don't starve its Nuxt builds of CPU
        extends: true,
        test: { name: 'storage', include: [storage], fileParallelism: false, sequence: { groupOrder: 1 } },
      },
      ...process.env.ATELIER_COMPAT ? [{ extends: true, test: { name: 'compat', include: [compat] } }] : [],
    ],
  },
})
