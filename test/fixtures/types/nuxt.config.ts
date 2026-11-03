// Type-level checks for what the module registers: aliases, auto-imports, runtime config
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
})
