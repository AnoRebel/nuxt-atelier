// Deno: the server built for Deno's runtime (the deno-server preset), configured from the environment.
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin'],
  compatibilityDate: '2026-10-01',
  nitro: { preset: 'deno-server' },
})
