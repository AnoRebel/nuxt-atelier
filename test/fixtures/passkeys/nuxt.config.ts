// The built-in auth adapter with passkeys, and a page driving them (app.vue), for a virtual authenticator
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { auth: { passkeys: true }, migrations: { autoApply: true } },
})
