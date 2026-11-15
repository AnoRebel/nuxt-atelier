// The @nuxtjs/i18n fixture under `compatibilityVersion: 5`: a non-blocking CI job reports whether the adapter
// works there yet (@nuxtjs/i18n 10.6's server code imports `useRuntimeConfig` from `#imports`, which Nuxt 5
// behaviour no longer provides to the server)
export default defineNuxtConfig({
  extends: ['../i18n-nuxtjs'],
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
