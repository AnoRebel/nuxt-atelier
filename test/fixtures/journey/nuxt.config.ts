// The full journey (test/e2e/journey.test.ts): an app with Nuxt Atelier, its admin and visual editor, and
// localized routes with @nuxtjs/i18n. The schema and blocks are the developer's part of the journey.
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module', '../../../packages/editor/src/module', '@nuxtjs/i18n', '../../../packages/i18n-nuxtjs/src/module'],
  pages: true,
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, locales: { codes: ['en', 'de'] }, seo: { titleTemplate: '%s | Journey' } },
  i18n: { locales: [{ code: 'en', language: 'en-US' }, { code: 'de', language: 'de-DE' }], defaultLocale: 'en', strategy: 'prefix_except_default' },
})
