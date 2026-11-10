// @nuxt-atelier/storage-s3: media in S3-compatible object storage (AWS S3, Cloudflare R2, MinIO…).
// Configure with NUXT_ATELIER_S3_ENDPOINT, _BUCKET, _REGION, _ACCESS_KEY_ID and _SECRET_ACCESS_KEY, and set
// `atelier.storage.driver` to "s3".
import type { NuxtModule } from '@nuxt/schema'
import { addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/storage-s3',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // runtime values (NUXT_ATELIER_S3_*): never baked into the build
    nuxt.options.runtimeConfig.atelierS3 = {
      endpoint: '',
      bucket: '',
      region: 'auto',
      accessKeyId: '',
      secretAccessKey: '',
      ...nuxt.options.runtimeConfig.atelierS3 as object | undefined,
    }
    addServerPlugin(resolve('./runtime/plugin'))
  },
})

export default module
