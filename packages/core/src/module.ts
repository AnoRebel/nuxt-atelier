import type { NuxtModule } from '@nuxt/schema'
import type { ModuleOptions } from './options'
import { addComponentsDir, addImports, addServerTemplate, addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { resolveOptions } from './options'
import { registryTypes, schemaTemplate } from './schema/discover'

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
      dbPoolSize: resolved.limits.dbPoolSize,
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

    // Collections and singletons: rescanned on every Nitro (re)build, so new files are picked up in dev
    addServerTemplate({ filename: '#atelier-schema', getContents: schemaTemplate })
    const types = resolve('./runtime/server/types')
    addTypeTemplate({
      filename: 'types/atelier-schema.d.ts',
      getContents: () => `declare module '#atelier-schema' {
  export const collections: Record<string, import(${JSON.stringify(types)}).CollectionDefinition>
  export const singletons: Record<string, import(${JSON.stringify(types)}).SingletonDefinition>
}
`,
    }, { nitro: true, nuxt: true }) // nuxt too: typed $fetch pulls server routes into the app project

    // Entry types: inferred by TypeScript from the definition files, so editing a field needs no regeneration
    addTypeTemplate({
      filename: 'types/atelier-registry.d.ts',
      getContents: () => registryTypes(resolve('./runtime/shared/infer')),
    }, { nitro: true, nuxt: true })
    // A new or deleted definition file changes the registry, which Nitro only rebuilds for files it
    // already imports: soft-restart so both the server registry and the types pick it up
    nuxt.hook('builder:watch', async (event, path) => {
      if ((event === 'add' || event === 'unlink') && /(?:^|\/)atelier\/(?:collections|singletons)\//.test(path))
        await nuxt.callHook('restart')
    })
  },
})

export default module
