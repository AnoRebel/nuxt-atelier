// Routable content served by the catch-all page: per-type patterns, per-locale patterns, components and layouts
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true } },
})
