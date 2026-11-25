// The built-in auth adapter with passkeys, a page driving them (pages/passkey-flows.vue) and the admin, for a virtual authenticator
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { auth: { passkeys: true }, migrations: { autoApply: true } },
})
