// An app with a Nuxt Atelier plugin installed as a module (test/fixtures/plugin-events)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module', '@nuxt-atelier/fixture-plugin-events'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
