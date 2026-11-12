// The content API, with roles exercising every permission rule (server/atelier/roles.ts)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, limits: { maxPageSize: 5 }, locales: { codes: ['en', 'de', 'fr'] } },
})
