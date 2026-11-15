// The full journey (test/e2e/journey.test.ts): an app with Nuxt Atelier, its admin and visual editor, and
// localized routes with @nuxtjs/i18n. The schema and blocks are the developer's part of the journey.
const nuxt5 = process.env.ATELIER_NUXT5 === '1'

export default defineNuxtConfig({
  modules: [
    '../../../packages/core/src/module',
    '../../../packages/admin/src/module',
    '../../../packages/editor/src/module',
    // neither i18n module builds with Nuxt 5 behaviour yet (docs: localization): there, locales aren't prefixed
    ...nuxt5 ? [] : ['@nuxtjs/i18n', '../../../packages/i18n-nuxtjs/src/module'],
  ],
  pages: true,
  // CI runs the journey with Nuxt 5 behaviour too (ATELIER_NUXT5=1)
  ...nuxt5 ? { future: { compatibilityVersion: 5 as const } } : {},
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, locales: { codes: ['en', 'de'] }, seo: { titleTemplate: '%s | Journey' } },
  ...nuxt5 ? {} : { i18n: { locales: [{ code: 'en', language: 'en-US' }, { code: 'de', language: 'de-DE' }], defaultLocale: 'en', strategy: 'prefix_except_default' } },
})
