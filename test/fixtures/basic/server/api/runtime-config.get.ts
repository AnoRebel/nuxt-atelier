import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'

// Test probe: exposes the runtime config the module set up
export default defineEventHandler(() => {
  const { atelier, public: { atelier: pub } } = useRuntimeConfig()
  return { databaseUrl: atelier.databaseUrl, storageDir: atelier.storage.dir, siteUrl: pub.siteUrl }
})
