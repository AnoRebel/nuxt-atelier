import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// Rayleigh: a portfolio with a blog, built on Nuxt Atelier. Content lives in server/atelier/, the look in
// app/; on first start, server/plugins/seed.ts fills an empty database with the demo content in seed/.
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
  // the demo content and its images, read by the seed plugin in any deployment
  nitro: { serverAssets: [{ baseName: 'seed', dir: fileURLToPath(new URL('./seed', import.meta.url)) }] },
  vite: { plugins: [tailwindcss()] },
  atelier: {
    database: { url: 'file:.data/rayleigh.sqlite' }, // NUXT_ATELIER_DATABASE_URL in production
    seo: { titleTemplate: '%s | Rayleigh' },
  },
})
