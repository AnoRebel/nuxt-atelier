// Cloudflare Workers: the cloudflare-module preset, D1 as the database, and uploads in R2 through its S3 API
// (npm install @nuxt-atelier/storage-s3). A Worker has no disk.
export default defineNuxtConfig({
  modules: ['nuxt-atelier', '@nuxt-atelier/admin', '@nuxt-atelier/storage-s3'],
  compatibilityDate: '2026-10-01',
  nitro: { preset: 'cloudflare-module' },
  atelier: {
    database: { url: 'd1:DB' }, // the binding name in wrangler.json
    migrations: { autoApply: true }, // `atelier migrate apply` can't reach D1
    storage: { driver: 's3' },
  },
})
