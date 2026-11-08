import type { NuxtModule } from '@nuxt/schema'
import { resolve as resolvePath } from 'node:path'
import type { ModuleOptions } from './options'
import { addComponentsDir, addImports, addServerHandler, addServerPlugin, addServerTemplate, addTemplate, addTypeTemplate, addVitePlugin, createResolver, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import { blockComponentsTemplate, blockDirectories, discoverBlocks } from './blocks/discover'
import { transformBlockSfc } from './blocks/transform'
import { setupDevMigrations } from './cli/dev'
import { resolveOptions } from './options'
import { registryTypes, schemaTemplate } from './schema/discover'
import { driversTemplate } from './schema/drivers'
import { migrationsTemplate } from './schema/migrations'

export type { ModuleOptions, ResolvedOptions } from './options'
export type { ColumnSpec, TableSpec } from './runtime/server/db/tables'

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
      limits: { maxPageSize: resolved.limits.maxPageSize, maxRelationDepth: resolved.limits.maxRelationDepth, maxNestingDepth: resolved.limits.maxNestingDepth, writesPerMinute: resolved.limits.writesPerMinute },
      migrations: { autoApply: resolved.migrations.autoApply }, // NUXT_ATELIER_MIGRATIONS_AUTO_APPLY
      storage: { dir: resolved.storage.dir }, // NUXT_ATELIER_STORAGE_DIR
      auth: { signInAttempts: resolved.auth.signInAttempts, signInWindow: resolved.auth.signInWindow, trustProxy: resolved.auth.trustProxy },
      ...config.atelier as object | undefined,
    }
    config.public.atelier = {
      siteUrl: '', // NUXT_PUBLIC_ATELIER_SITE_URL
      ...config.public.atelier as object | undefined,
    }

    nuxt.options.alias['#atelier/server'] = resolve('./runtime/server')
    nuxt.options.alias['#atelier'] = resolve('./runtime/app')

    addImports({ name: 'useAtelierConfig', from: resolve('./runtime/app/composables/useAtelierConfig') })
    addImports(['useAtelierQuery', 'useAtelierEntry'].map(name => ({ name, from: resolve('./runtime/app/composables/useAtelierQuery') })))
    addImports({ name: 'useAtelierPreview', from: resolve('./runtime/app/composables/useAtelierPreview') })
    addComponentsDir({ path: resolve('./runtime/app/components'), prefix: 'Atelier' })

    // Collections and singletons: rescanned on every Nitro (re)build, so new files are picked up in dev
    addServerTemplate({ filename: '#atelier-schema', getContents: schemaTemplate })
    addServerTemplate({ filename: '#atelier-drivers', getContents: () => driversTemplate(nuxt.options.rootDir, resolved.database.url) })
    addServerTemplate({ filename: '#atelier-migrations', getContents: () => migrationsTemplate(nuxt.options.rootDir) })
    addServerPlugin(resolve('./runtime/server/plugins/migrations'))

    // blocks: lazy components for the app (`#atelier-blocks`); their schemas go to the server in `#atelier-schema`
    const components = new Map<string, { filePath: string, export: string }>()
    nuxt.hook('components:extend', (list) => {
      components.clear()
      for (const c of list)
        components.set(c.pascalName, { filePath: c.filePath, export: c.export ?? 'default' })
    })
    const blocksTemplate = addTemplate({ filename: 'atelier/blocks.mjs', getContents: () => blockComponentsTemplate(discoverBlocks(nuxt), components) })
    nuxt.options.alias['#atelier-blocks'] = blocksTemplate.dst
    let nitro: { hooks: { callHook: (name: 'rollup:reload') => Promise<unknown> } } | undefined
    nuxt.hook('nitro:init', (instance) => {
      nitro = instance as never
    })
    // macro-style blocks: drop the schema and the field helpers from the component the browser loads
    const blockDirs = blockDirectories(nuxt).map(dir => `${dir}/`)
    nuxt.hook('builder:watch', async (_event, path) => {
      const file = resolvePath(nuxt.options.srcDir, path)
      if (!blockDirs.some(dir => file.startsWith(dir)))
        return
      await updateTemplates({ filter: template => template.filename === 'atelier/blocks.mjs' })
      await nitro?.hooks.callHook('rollup:reload') // the server's block schemas
    })
    addVitePlugin({
      name: 'nuxt-atelier:blocks',
      enforce: 'pre',
      transform(code, id) {
        // the SFC itself, never the Vue plugin's sub-modules (`?vue&type=…`)
        if (!id.endsWith('.vue') || id.includes('?') || !blockDirs.some(dir => id.startsWith(dir)))
          return
        return transformBlockSfc(code, id)
      },
    })
    for (const [route, method] of [['login', 'post'], ['logout', 'post'], ['me', 'get']] as const)
      addServerHandler({ route: `/api/_atelier/auth/${route}`, method, handler: resolve(`./runtime/server/api/auth/${route}.${method}`) })
    if (resolved.auth.passkeys) // off: no passkey routes, so they 404 and nothing of @simplewebauthn is bundled
      addServerHandler({ route: '/api/_atelier/auth/passkeys/**', handler: resolve('./runtime/server/api/auth/passkeys') })
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/csrf') })
    addServerHandler({ route: '/api/_atelier/audit', method: 'get', handler: resolve('./runtime/server/api/audit') })
    addServerHandler({ route: '/api/_atelier/openapi.json', method: 'get', handler: resolve('./runtime/server/api/openapi') })
    addServerHandler({ route: '/api/_atelier/setup', handler: resolve('./runtime/server/api/setup') })
    for (const resource of ['users', 'roles', 'tokens', 'collections', 'singletons']) {
      addServerHandler({ route: `/api/_atelier/${resource}`, handler: resolve(`./runtime/server/api/${resource}`) })
      addServerHandler({ route: `/api/_atelier/${resource}/**`, handler: resolve(`./runtime/server/api/${resource}`) })
    }
    addServerHandler({ route: '/api/_atelier/**', handler: resolve('./runtime/server/api/not-found') })
    if (nuxt.options.dev)
      setupDevMigrations(nuxt)

    const types = resolve('./runtime/server/types')
    addTypeTemplate({
      filename: 'types/atelier-schema.d.ts',
      getContents: () => `declare module '#atelier-schema' {
  export const collections: Record<string, import(${JSON.stringify(types)}).CollectionDefinition>
  export const singletons: Record<string, import(${JSON.stringify(types)}).SingletonDefinition>
  export const roles: import(${JSON.stringify(resolve('./runtime/shared/policy'))}).Roles
  export const tables: Record<string, import(${JSON.stringify(resolve('./runtime/server/db/tables'))}).TableSpec>
  export const blocks: Record<string, import(${JSON.stringify(resolve('./runtime/shared/blocks'))}).BlockSchema>
}
declare module '#atelier-blocks' {
  export const blocks: Record<string, { component: () => Promise<import('vue').Component>, areas: string[] }>
}
declare module '#atelier-drivers' {
  export const drivers: import(${JSON.stringify(resolve('./runtime/server/db/driver'))}).DriverLoaders
}
declare module '#atelier-migrations' {
  export const migrations: Partial<Record<'sqlite' | 'postgres' | 'mysql', { name: string, sql: string }[]>>
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
      if ((event === 'add' || event === 'unlink') && /(?:^|\/)atelier\/(?:(?:collections|singletons)\/|(?:roles|tables)\.[mc]?[jt]s$)/.test(path))
        await nuxt.callHook('restart')
    })
  },
})

export default module
