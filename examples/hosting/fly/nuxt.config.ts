// Fly.io: Nuxt's default Node server in the Dockerfile of the Docker guide, with SQLite on a volume.
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
})
