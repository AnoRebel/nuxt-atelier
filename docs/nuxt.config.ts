export default defineNuxtConfig({
  extends: ['docus'],
  modules: ['nuxt-atelier', 'nuxt-umami'],
  app: {
    head: {
      // Rybbit (rybbit.anorebel.net): only when a site id is set at build time, like Umami below
      script: process.env.NUXT_RYBBIT_SITE_ID
        ? [{ 'src': 'https://rybbit.anorebel.net/api/script.js', 'defer': true, 'data-site-id': process.env.NUXT_RYBBIT_SITE_ID }]
        : [],
    },
  },
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
  // Umami (umami.anorebel.net), proxied through the docs server so blockers and CORS don't drop it
  umami: {
    id: process.env.NUXT_UMAMI_SITE_ID || '',
    host: 'https://umami.anorebel.net',
    autoTrack: true,
    proxy: 'cloak',
    enabled: !!process.env.NUXT_UMAMI_SITE_ID,
  },
})
