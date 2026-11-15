// The DevTools integration: its panels and actions, in dev (test/devtools)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/devtools/src/module'],
  devtools: { enabled: true },
  compatibilityDate: '2026-10-01',
})
