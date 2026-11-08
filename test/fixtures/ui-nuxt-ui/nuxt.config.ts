// The shared content rendered with Nuxt UI: blocks wrap UPageHero and UCard, and the Cta block is
// UButton itself, used as a schema-file block with no wrapper component
export default defineNuxtConfig({
  extends: ['../ui-shared'],
  modules: ['../../../packages/core/src/module', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ui: { fonts: false, colorMode: false },
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
