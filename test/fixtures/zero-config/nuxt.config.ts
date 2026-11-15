// Zero-config install, as the docs have it: the module and the admin, no options
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module'],
  compatibilityDate: '2026-10-01',
})
