export default defineNuxtConfig({
  extends: ['@nuxt-atelier/layer'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
