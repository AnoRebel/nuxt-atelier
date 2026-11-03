// A built app with a committed migration (server/atelier/migrations/sqlite), for the pending-migration checks
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
})
