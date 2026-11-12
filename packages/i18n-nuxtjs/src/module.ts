// The @nuxtjs/i18n adapter: the site's pages follow @nuxtjs/i18n's locales and URL strategy, even when another
// i18n module is installed too. Nuxt Atelier reads the module's options itself (see `atelier.i18n.module`); this
// pins the choice. Add it after nuxt-atelier and @nuxtjs/i18n in `modules`.
import type { NuxtModule } from '@nuxt/schema'
import type {} from 'nuxt-atelier' // the atelier:i18n hook
import { defineNuxtModule, hasNuxtModule } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/i18n-nuxtjs',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_, nuxt) {
    nuxt.hook('atelier:i18n', (choose) => {
      if (!hasNuxtModule('@nuxtjs/i18n', nuxt))
        console.warn('[@nuxt-atelier/i18n-nuxtjs] @nuxtjs/i18n isn\'t installed: add it to `modules` too')
      choose('@nuxtjs/i18n')
    })
  },
})

export default module
