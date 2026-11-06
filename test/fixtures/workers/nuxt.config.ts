// Built for Cloudflare Workers and run in Miniflare with a local D1 binding (test/storage/workers.test.ts)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  nitro: { preset: 'cloudflare-module' },
  atelier: {
    database: { url: 'd1:DB' },
    migrations: { autoApply: true }, // D1 can't be reached by `atelier migrate apply`
  },
})
