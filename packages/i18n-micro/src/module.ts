// The nuxt-i18n-micro adapter: the site's pages follow nuxt-i18n-micro's locales and URL strategy, even when another
// i18n module is installed too. Nuxt Atelier reads the module's options itself (see `atelier.i18n.module`); this
// pins the choice. Add it after nuxt-atelier and nuxt-i18n-micro in `modules`.
import type { NuxtModule } from '@nuxt/schema'
import type {} from 'nuxt-atelier' // the atelier:i18n hook
import { defineNuxtModule, hasNuxtModule } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/i18n-micro',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_, nuxt) {
    nuxt.hook('atelier:i18n', (choose) => {
      if (!hasNuxtModule('nuxt-i18n-micro', nuxt))
        console.warn('[@nuxt-atelier/i18n-micro] nuxt-i18n-micro isn\'t installed: add it to `modules` too')
      choose('nuxt-i18n-micro')
    })
  },
})

export default module
