// Bun: the server built for Bun's runtime (the bun preset), configured from the environment.
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
  nitro: { preset: 'bun' },
})
