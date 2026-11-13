export default defineNuxtConfig({
  extends: ['@nuxt-atelier/layer'],
  compatibilityDate: '2026-10-01',
  // the admin somewhere else, leaving /admin to the app
  atelier: { migrations: { autoApply: true }, admin: { base: '/studio' } },
})
