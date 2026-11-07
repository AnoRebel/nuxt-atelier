// A built app using the built-in auth adapter, with a committed migration (server/atelier/migrations/sqlite)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
