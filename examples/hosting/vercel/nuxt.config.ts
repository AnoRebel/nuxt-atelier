// Vercel: the vercel preset, picked when building on Vercel. A function has no lasting disk: the database is a
// PostgreSQL or libSQL server, and uploads go to Vercel Blob (npm install pg @nuxt-atelier/storage-vercel-blob).
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/storage-vercel-blob'],
  compatibilityDate: '2026-10-01',
  atelier: {
    storage: { driver: 'vercel-blob' },
    migrations: { autoApply: true },
    auth: { trustProxy: true }, // Vercel sets X-Forwarded-For
  },
})
