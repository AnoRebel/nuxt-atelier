// The admin over a site with hostile global CSS (no Tailwind, no Nuxt UI): the admin must look the same,
// and the site's pages must carry none of the admin's CSS.
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module'],
  css: ['~/assets/hostile.css'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
