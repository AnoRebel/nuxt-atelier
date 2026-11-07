import type { NuxtModule } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addServerHandler, addServerPlugin, addServerTemplate, addTypeTemplate, createResolver, defineNuxtModule, getLayerDirectories, useLogger } from '@nuxt/kit'

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/auth-better-auth',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // server/atelier/auth.ts: the app's (or a layer's) Better Auth config
    const configFile = getLayerDirectories(nuxt)
      .flatMap(layer => ['ts', 'mts', 'js', 'mjs'].map(ext => join(layer.server, 'atelier', `auth.${ext}`)))
      .find(existsSync)
    if (!configFile)
      useLogger('nuxt-atelier').warn('@nuxt-atelier/auth-better-auth: no server/atelier/auth.ts; using Better Auth with its defaults (email and password)')
    addServerTemplate({
      filename: '#atelier-better-auth',
      getContents: () => configFile ? `export { default } from ${JSON.stringify(configFile)}` : 'export default {}',
    })
    addTypeTemplate({
      filename: 'types/atelier-better-auth.d.ts',
      getContents: () => `declare module '#atelier-better-auth' {
  const config: import(${JSON.stringify(resolve('./config'))}).AtelierBetterAuthConfig
  export default config
}
`,
    }, { nitro: true })

    addServerPlugin(resolve('./runtime/server/plugin'))
    addServerHandler({ route: '/api/auth/**', handler: resolve('./runtime/server/handler') })
  },
})

export default module
