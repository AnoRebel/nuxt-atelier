// Better Auth as the CMS's auth adapter, with a generic OAuth provider (a mock the test starts)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/auth-better-auth/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
