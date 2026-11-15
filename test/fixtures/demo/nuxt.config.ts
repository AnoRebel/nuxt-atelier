// Demo mode: every visitor who starts a demo edits a copy of the site; idle copies go after 10 seconds
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, demo: { enabled: true, idleTimeout: 10, perAddress: 3, frameAncestors: ['https://docs.example.com'] } },
})
