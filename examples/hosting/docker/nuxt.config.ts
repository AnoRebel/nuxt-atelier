// Docker and Docker Compose: Nuxt's default Node server, configured from the environment (compose.yml, .env).
// PostgreSQL needs its driver in your app: npm install pg
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
})
