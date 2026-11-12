// Localized routes with @nuxtjs/i18n, chosen with its adapter: /de/produkte/stuhl is the German product
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '@nuxtjs/i18n', '../../../packages/i18n-nuxtjs/src/module'],
  pages: true,
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, locales: { codes: ['en', 'de'] } },
  i18n: { locales: [{ code: 'en', language: 'en-US' }, { code: 'de', language: 'de-DE' }], defaultLocale: 'en', strategy: 'prefix_except_default' },
})
