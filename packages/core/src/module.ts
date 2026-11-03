import type { NuxtModule } from '@nuxt/schema'
import type { ModuleOptions } from './options'
import { addComponentsDir, addImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { resolveOptions } from './options'

export type { ModuleOptions, ResolvedOptions } from './options'

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-atelier',
    configKey: 'atelier',
    compatibility: {
      nuxt: '>=4.6.0',
      server: 'nuxt',
    },
  },
  // defaults live in the options schema, so validation and defaults can't drift
  setup(options, nuxt) {
    const resolved = resolveOptions(options)
    const { resolve } = createResolver(import.meta.url)

    // Build-time values become runtime defaults; NUXT_ATELIER_* / NUXT_PUBLIC_ATELIER_* env vars
    // override them in a built app. Values the host already set in runtimeConfig win.
    // The session secret is Nuxt's own runtimeConfig.appSecret (NUXT_APP_SECRET).
    const config = nuxt.options.runtimeConfig
    config.atelier = {
      databaseUrl: resolved.database.url, // NUXT_ATELIER_DATABASE_URL
      storage: { dir: resolved.storage.dir }, // NUXT_ATELIER_STORAGE_DIR
      ...config.atelier as object | undefined,
    }
    config.public.atelier = {
      siteUrl: '', // NUXT_PUBLIC_ATELIER_SITE_URL
      ...config.public.atelier as object | undefined,
    }

    nuxt.options.alias['#atelier/server'] = resolve('./runtime/server')
    nuxt.options.alias['#atelier'] = resolve('./runtime/app')

    addImports({ name: 'useAtelierConfig', from: resolve('./runtime/app/composables/useAtelierConfig') })
    addComponentsDir({ path: resolve('./runtime/app/components'), prefix: 'Atelier' })
  },
})

export default module
