export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/editor'],
  runtimeConfig: {
    atelier: {
      // Override with NUXT_ATELIER_DATABASE_URL, e.g. postgres://user:pass@localhost:5432/atelier
      databaseUrl: 'file:.data/atelier.sqlite',
    },
  },
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
