// The content API fixture under `compatibilityVersion: 5` (Nuxt 5 behaviour on Nuxt 4)
export default defineNuxtConfig({
  extends: ['../api'],
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
