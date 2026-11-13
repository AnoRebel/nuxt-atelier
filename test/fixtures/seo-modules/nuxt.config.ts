// With @nuxtjs/robots and @nuxtjs/sitemap: the CMS's rules and pages go through them.
export default defineNuxtConfig({
  modules: ['@nuxtjs/robots', '@nuxtjs/sitemap', '../../../packages/core/src/module'],
  site: { url: 'https://example.com' },
  compatibilityDate: '2026-10-01',
  atelier: { migrations: { autoApply: true }, seo: { robots: { rules: [{ userAgent: ['GPTBot'], disallow: ['/'] }] } } },
})
