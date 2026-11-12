// Routable content served by the catch-all page: per-type patterns, per-locale patterns, components and layouts.
// Background jobs run every 2 seconds, and the trigger endpoint stops starting jobs after 1. Webhooks may
// reach 127.0.0.1, where the test runs its receiver.
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, jobs: { schedule: '*/2 * * * * *', triggerBudget: 1 }, webhooks: { allow: ['127.0.0.1'] }, seo: { titleTemplate: '%s · Atelier', jsonLd: { '@type': 'Organization', 'name': 'Atelier' } } },
})
