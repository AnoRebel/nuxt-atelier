// The shared content rendered with plain scoped CSS: no Tailwind, no component library
export default defineNuxtConfig({
  extends: ['../ui-shared'],
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
