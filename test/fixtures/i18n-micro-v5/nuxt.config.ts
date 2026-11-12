// The nuxt-i18n-micro fixture under `compatibilityVersion: 5`: a non-blocking CI job reports whether the
// adapter works there yet (nuxt-i18n-micro's server code imported `useRuntimeConfig` from `#imports`,
// which Nuxt 5 behaviour no longer provides to the server)
export default defineNuxtConfig({
  extends: ['../i18n-micro'],
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
