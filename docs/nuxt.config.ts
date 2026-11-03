export default defineNuxtConfig({
  extends: ['docus'],
  modules: ['nuxt-atelier'],
  site: {
    name: 'Nuxt Atelier',
    url: 'https://nuxt-atelier.anorebel.net',
  },
  content: {
    // Node's built-in SQLite (Node 22.13+), so no native better-sqlite3 build
    experimental: { sqliteConnector: 'native' },
  },
  future: { compatibilityVersion: 5 },
  experimental: {
    // Docus's nuxt-llms 0.2.0 imports useNitroApp from #imports, which v5 no longer auto-imports
    nitroAutoImports: true,
  },
  compatibilityDate: '2026-10-01',
  nitro: {
    // Docus sets this to false; a crawled internal link that 404s must fail the build
    prerender: { failOnError: true },
  },
  llms: {
    domain: 'https://nuxt-atelier.anorebel.net',
    title: 'Nuxt Atelier',
    description: 'A visual CMS module for Nuxt: typed content schema, block-based visual editor and admin dashboard, added to an existing Nuxt app.',
    full: {
      title: 'Nuxt Atelier: full documentation',
      description: 'Every Nuxt Atelier documentation page in one Markdown file.',
    },
    notes: [
      'Reading this documentation as an agent: append `.md` to any page URL, or send `Accept: text/markdown`.',
    ],
  },
})
