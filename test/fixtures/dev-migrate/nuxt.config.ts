// `nuxt dev` keeps the database in step with the schema; the test edits the collection and restores it
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
})
