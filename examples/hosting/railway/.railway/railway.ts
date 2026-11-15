// Nuxt Atelier on Railway: the app, a PostgreSQL database and a volume for uploads.
// Needs the railway package (npm install -D railway); `railway config apply` applies it.
import { defineRailway, postgres, preserve, project, service, volume } from 'railway/iac'

export default defineRailway(() => {
  const db = postgres('postgres')
  const uploads = volume('uploads', { sizeMB: 1024 })

  const web = service('web', {
    build: 'npm run build',
    start: 'node .output/server/index.mjs',
    healthcheck: '/api/_atelier/health/ready',
    volumeMounts: { '/data': uploads },
    env: {
      NUXT_ATELIER_DATABASE_URL: db.env.DATABASE_URL,
      NUXT_ATELIER_STORAGE_DIR: '/data/uploads',
      NUXT_ATELIER_MIGRATIONS_AUTO_APPLY: 'true',
      NUXT_ATELIER_AUTH_TRUST_PROXY: 'true',
      NUXT_APP_SECRET: preserve(),
      NUXT_PUBLIC_ATELIER_SITE_URL: preserve(),
      NUXT_ATELIER_AUTH_SETUP_TOKEN: preserve(),
    },
  })

  return project('my-site', { resources: [web, db, uploads] })
})
