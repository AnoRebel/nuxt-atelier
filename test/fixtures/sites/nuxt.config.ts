// Two sites from one deployment, picked by host (tests send X-Forwarded-Host, trusted here)
export default defineNuxtConfig({
  modules: ['../../../packages/core/src/module', '../../../packages/admin/src/module'],
  compatibilityDate: '2026-10-01',
  atelier: {
    migrations: { autoApply: true },
    auth: { trustProxy: true },
    locales: { codes: ['en', 'de'] },
    sites: {
      a: { hosts: ['a.test'], label: 'Site A' },
      b: { hosts: ['b.test', 'www.b.test'], label: 'Site B', locales: ['de'], defaultLocale: 'de' },
    },
  },
})
