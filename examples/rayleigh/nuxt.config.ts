// #region seed
import { fileURLToPath } from 'node:url'
// #endregion
import tailwindcss from '@tailwindcss/vite'

// Rayleigh: a portfolio with a blog, built on Nuxt Atelier. Content lives in server/atelier/, the look in app/.
// #region seed
// On first start, server/middleware/seed.ts fills an empty database with the demo content in seed/.
// #endregion
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/editor'],
  // every page is an entry, served by Nuxt Atelier's catch-all page: the router without an app/pages/
  pages: true,
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400;1,700&family=Poppins:wght@500&display=swap' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-01',
  // #region seed
  // the demo content and its images, read by the seed middleware in any deployment
  nitro: { serverAssets: [{ baseName: 'seed', dir: fileURLToPath(new URL('./seed', import.meta.url)) }] },
  // #endregion
  vite: { plugins: [tailwindcss()] },
  atelier: {
    database: { url: 'file:.data/rayleigh.sqlite' }, // NUXT_ATELIER_DATABASE_URL in production
    seo: { titleTemplate: '%s | Rayleigh' },
    // #region seed
    // Nuxt Atelier's live demo (built with ATELIER_DEMO=true): every visitor edits a copy of their own
    demo: { enabled: process.env.ATELIER_DEMO === 'true', frameAncestors: ['https://nuxt-atelier.anorebel.net'] },
    // #endregion
  },
  // #region blog
  // the admin bundles the icons it shows: the posts' (`admin.icon`) joins them
  atelierAdmin: { icons: ['pin'] },
  // #endregion
})
