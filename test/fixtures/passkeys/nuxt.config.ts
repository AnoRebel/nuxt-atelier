// The built-in auth adapter with passkeys, a page driving them (pages/passkey-flows.vue) and the admin, for a virtual authenticator.
// A page transition like many sites have: the admin keeps one page across its own navigation, without it
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module'],
  app: { pageTransition: { name: 'page', mode: 'out-in' } },
  compatibilityDate: '2026-10-01',
  atelier: { auth: { passkeys: true }, migrations: { autoApply: true } },
})
