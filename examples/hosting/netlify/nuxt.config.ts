// Netlify: the netlify preset, picked when building on Netlify. A function has no lasting disk: the database is a
// PostgreSQL or libSQL server, and uploads go to S3-compatible storage (npm install pg @nuxt-atelier/storage-s3).
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/storage-s3'],
  compatibilityDate: '2026-10-01',
  atelier: {
    storage: { driver: 's3' },
    migrations: { autoApply: true },
    jobs: { schedule: false }, // no scheduler on Netlify: an external one calls the trigger endpoint
    auth: { trustProxy: true }, // Netlify sets X-Forwarded-For
  },
})
