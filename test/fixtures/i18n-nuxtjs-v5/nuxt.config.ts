// The @nuxtjs/i18n fixture under `compatibilityVersion: 5`, run by a non-blocking CI job that reports whether the
// adapter keeps working there. Its migrations are its own (server/atelier/migrations): the extended fixture's
// aren't applied
export default defineNuxtConfig({
  extends: ['../i18n-nuxtjs'],
  future: { compatibilityVersion: 5 },
  compatibilityDate: '2026-10-01',
})
