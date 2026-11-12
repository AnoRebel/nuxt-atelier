// Localized routes with nuxt-i18n-micro (the default adapter): /de/produkte/stuhl is the German product
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', 'nuxt-i18n-micro'],
  pages: true,
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, locales: { codes: ['en', 'de'] } },
  i18n: { locales: [{ code: 'en', iso: 'en-US' }, { code: 'de', iso: 'de-DE' }], defaultLocale: 'en', strategy: 'prefix_except_default', translationDir: 'locales' },
})
