// The visual editor in the admin, over routable pages made of blocks
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module', '../../../packages/editor/src/module'],
  // hostile global CSS: the editor's chrome is isolated from it (test/editor, style isolation)
  css: ['~/assets/hostile.css'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
