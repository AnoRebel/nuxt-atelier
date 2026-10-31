import type { NuxtModule } from '@nuxt/schema'
import { defineNuxtModule } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/storage-s3',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup() {},
})

export default module
