import type { NuxtModule } from '@nuxt/schema'
import { addServerHandler, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  /** Content types (`posts`) or fields (`posts.internalNotes`), and `media`, never sent to the provider. */
  exclude?: string[]
  /** AI requests per user per hour (default 60). */
  requestsPerHour?: number
  /** Tokens (in and out) per user per 24 hours (default 200000). */
  tokensPerDay?: number
}

// the hooks nuxt-atelier and @nuxt-atelier/admin declare, typed here without depending on them
type Hook = (name: string, fn: (list: unknown[]) => void) => void

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxt-atelier/ai',
    configKey: 'atelierAi',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  defaults: { exclude: [], requestsPerHour: 60, tokensPerDay: 200_000 },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // private: the provider and its keys are the app's server plugin's business (registerAiAdapter)
    nuxt.options.runtimeConfig.atelierAi = { exclude: options.exclude ?? [], requestsPerHour: options.requestsPerHour ?? 60, tokensPerDay: options.tokensPerDay ?? 200_000 }
    addServerHandler({ route: '/api/_atelier/ai', handler: resolve('./runtime/server/api') })
    addServerHandler({ route: '/api/_atelier/ai/**', handler: resolve('./runtime/server/api') })
    // registerAiAdapter and aiSdkAdapter for the app's server plugin
    nuxt.options.nitro.alias = { ...nuxt.options.nitro.alias, '#atelier-ai': resolve('./runtime/server/adapter') }
    addTypeTemplate({
      filename: 'types/atelier-ai.d.ts',
      getContents: () => `declare module '#atelier-ai' {\n  export * from ${JSON.stringify(resolve('./runtime/server/adapter'))}\n}\n`,
    }, { nitro: true, nuxt: true })
    // the usage table, as a layer's extra table
    ;(nuxt.hook as Hook)('atelier:dirs', dirs => void dirs.push(resolve('./runtime/content')))
    // the admin's AI actions and usage page, when the admin is installed
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@nuxt-atelier/admin', nuxt))
        return
      nuxt.options.alias['#atelier-admin-ai'] = resolve('./runtime/admin/index')
    })
    // for those who manage users: what each of them used
    ;(nuxt.hook as Hook)('atelier:admin:pages', (pages) => {
      pages.push({ path: 'ai-usage', label: 'AI usage', icon: 'sparkles', requires: 'users', component: resolve('./runtime/admin/AiUsage.vue') })
    })
  },
})

export default module

export type { AiAdapter, AiRequest, AiResult } from './runtime/server/adapter'
