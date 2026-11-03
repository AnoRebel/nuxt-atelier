export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/editor'],
  // Database: SQLite by default; override with NUXT_ATELIER_DATABASE_URL (see .env.example)
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
