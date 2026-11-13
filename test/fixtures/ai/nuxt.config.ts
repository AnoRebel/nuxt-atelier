// AI assist with a fake provider (server/plugins/ai.ts) that records what it's sent
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module', '../../../packages/ai/src/module'],
  runtimeConfig: { aiKey: '' }, compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, locales: { codes: ['en', 'fr'] } },
  atelierAi: { exclude: ['posts.notes', 'secrets'], requestsPerHour: 25 },
  // NUXT_AI_KEY: the provider's key, on the server only
})
