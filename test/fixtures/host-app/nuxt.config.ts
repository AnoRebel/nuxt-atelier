// An existing app with its own app.vue, layout, pages and root id
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  app: { rootId: 'host-root' },
  compatibilityDate: '2026-10-01',
})
