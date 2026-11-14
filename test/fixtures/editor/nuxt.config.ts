// The visual editor in the admin, over routable pages made of blocks
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module', '../../../packages/editor/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
