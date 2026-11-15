// Railway: Nuxt's default Node server, configured from the service's variables (.railway/railway.ts).
// PostgreSQL needs its driver in your app: npm install pg
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
})
