// @nuxt-atelier/storage-vercel-blob: media in Vercel Blob. Connect a Blob store to the Vercel project (it
// sets BLOB_READ_WRITE_TOKEN) and set `atelier.storage.driver` to "vercel-blob".
import type { NuxtModule } from '@nuxt/schema'
import { addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/storage-vercel-blob',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // NUXT_ATELIER_VERCEL_BLOB_TOKEN, or Vercel's own BLOB_READ_WRITE_TOKEN
    nuxt.options.runtimeConfig.atelierVercelBlob = { token: '', ...nuxt.options.runtimeConfig.atelierVercelBlob as object | undefined }
    addServerPlugin(resolve('./runtime/plugin'))
  },
})

export default module
