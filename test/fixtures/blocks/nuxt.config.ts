// Blocks from the app and a layer (layers/base), both styles, rendered with <AtelierBlocks>
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
