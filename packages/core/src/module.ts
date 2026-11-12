import type { NuxtModule, NuxtPage } from '@nuxt/schema'
import { resolve as resolvePath } from 'node:path'
import type { ModuleOptions } from './options'
import { addComponentsDir, addImports, extendPages, hasNuxtModule, addServerHandler, addServerPlugin, addServerTemplate, addTemplate, addTypeTemplate, addVitePlugin, createResolver, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import { blockComponentsTemplate, blockDirectories, discoverBlocks } from './blocks/discover'
import { transformBlockSfc } from './blocks/transform'
import { setupDevMigrations } from './cli/dev'
import { resolveOptions } from './options'
import { collectModuleDirectories } from './sources'
import { adapterFrom } from './runtime/shared/i18n'
import { resolveLocales } from './runtime/shared/locales'
import { registryTypes, schemaTemplate } from './schema/discover'
import { driversTemplate } from './schema/drivers'
import { migrationsTemplate } from './schema/migrations'

export type { ModuleOptions, ResolvedOptions } from './options'
export type { ColumnSpec, TableSpec } from './runtime/server/db/tables'

/** Deploy presets whose disk doesn't outlast a deploy or an instance. */
const EPHEMERAL = /^(?:vercel|netlify|aws[-_]lambda|aws[-_]amplify|azure|cloudflare|deno[-_]deploy|firebase|edgio|zeabur|stormkit)/

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
      media: { accept: resolved.media.accept, widths: resolved.media.widths },
      limits: { maxBodySize: resolved.limits.maxBodySize, maxUploadSize: resolved.limits.maxUploadSize, maxPageSize: resolved.limits.maxPageSize, maxRelationDepth: resolved.limits.maxRelationDepth, maxNestingDepth: resolved.limits.maxNestingDepth, writesPerMinute: resolved.limits.writesPerMinute, cacheSize: resolved.limits.cacheSize, jobConcurrency: resolved.limits.jobConcurrency },
      jobs: { secret: '', triggerBudget: resolved.jobs.triggerBudget }, // NUXT_ATELIER_JOBS_SECRET
      revisions: { keep: resolved.revisions.keep, days: resolved.revisions.days },
      webhooks: { allow: resolved.webhooks.allow }, // NUXT_ATELIER_WEBHOOKS_ALLOW
      migrations: { autoApply: resolved.migrations.autoApply }, // NUXT_ATELIER_MIGRATIONS_AUTO_APPLY
      storage: { driver: resolved.storage.driver, dir: resolved.storage.dir }, // NUXT_ATELIER_STORAGE_DIR
      auth: { signInAttempts: resolved.auth.signInAttempts, signInWindow: resolved.auth.signInWindow, trustProxy: resolved.auth.trustProxy },
      ...config.atelier as object | undefined,
    }
    config.public.atelier = {
      siteUrl: '', // NUXT_PUBLIC_ATELIER_SITE_URL
      mediaWidths: resolved.media.widths, // the image variant widths, for srcset
      mediaProvider: resolved.media.provider ?? '', // an image service's URL template, when variants aren't made here
      locales: resolveLocales(resolved.locales), // the content locales, for the admin and query helpers
      seo: { titleTemplate: resolved.seo.titleTemplate, jsonLd: resolved.seo.jsonLd ?? null },
      admin: { base: resolved.admin.base, passkeys: resolved.auth.passkeys },
      i18n: null as unknown, // the site's i18n module, set once every module is set up (below)
      ...config.public.atelier as object | undefined,
    }

    // Security headers: the admin may only be framed by itself (its preview frames the site, not the reverse),
    // and nothing under it or the CMS API is sniffed into another type. A rule the host sets for the same path wins.
    const base = resolved.admin.base
    const common = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' }
    const admin = { headers: { ...common, 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': 'frame-ancestors \'self\'; base-uri \'self\'; object-src \'none\'; form-action \'self\'' } }
    nuxt.options.routeRules = {
      [base]: admin,
      [`${base}/**`]: admin,
      '/api/_atelier/**': { headers: { ...common, 'x-frame-options': 'DENY' } },
      ...nuxt.options.routeRules,
    } as typeof nuxt.options.routeRules

    nuxt.options.alias['#atelier/server'] = resolve('./runtime/server')
    nuxt.options.alias['#atelier/shared'] = resolve('./runtime/shared') // field schemas and policy, for the admin
    nuxt.options.alias['#atelier'] = resolve('./runtime/app')

    addImports({ name: 'useAtelierConfig', from: resolve('./runtime/app/composables/useAtelierConfig') })
    addImports(['useAtelierQuery', 'useAtelierEntry'].map(name => ({ name, from: resolve('./runtime/app/composables/useAtelierQuery') })))
    addImports({ name: 'useAtelierArea', from: resolve('./runtime/app/composables/useAtelierArea') })
    addImports({ name: 'useAtelierRouteEntry', from: resolve('./runtime/app/composables/useAtelierRouteEntry') })
    addImports({ name: 'useAtelierLocalePath', from: resolve('./runtime/app/composables/useAtelierLocalePath') })
    addImports({ name: 'useAtelierPreview', from: resolve('./runtime/app/composables/useAtelierPreview') })
    addComponentsDir({ path: resolve('./runtime/app/components'), prefix: 'Atelier' })
    // the catch-all serving routable entries: ranked below every page of the app, so the app's own pages win.
    // Only in apps that route: Nuxt turns its router on when this hook adds a page, and an app with just an
    // app.vue (no <NuxtPage>) would then 404 everywhere. Those apps render entries themselves.
    // the app's own routes (without the catch-all), for the server to tell which entries they hide
    let hostPages: { path: string, children?: unknown[] }[] | undefined
    const routeTree = (pages: NuxtPage[]): { path: string, children?: unknown[] }[] => pages
      .filter(page => page.name !== 'atelier-page')
      .map(page => ({ path: page.path, ...page.name ? { name: page.name } : {}, ...page.children?.length ? { children: routeTree(page.children) } : {} }))
    nuxt.hook('pages:resolved', async (pages) => {
      const next = routeTree(pages)
      const changed = hostPages !== undefined && JSON.stringify(next) !== JSON.stringify(hostPages)
      hostPages = next
      if (changed && nuxt.options.dev)
        await nitro?.hooks.callHook('rollup:reload') // a page added or removed
    })
    addServerTemplate({ filename: '#atelier-host-pages', getContents: () => `export const pages = ${JSON.stringify(hostPages ?? [])}\n` })
    const pagesOption = nuxt.options.pages as boolean | { enabled?: boolean } | undefined
    const pagesForced = pagesOption === true || (typeof pagesOption === 'object' && pagesOption.enabled === true)
    extendPages((pages) => {
      if (pages.length || pagesForced)
        pages.push({ name: 'atelier-page', path: '/:path(.*)*', file: resolve('./runtime/app/pages/AtelierPage'), meta: { layout: false } })
    })

    // Collections and singletons: rescanned on every Nitro (re)build, so new files are picked up in dev
    const locales = resolveLocales(resolved.locales)
    addServerTemplate({ filename: '#atelier-schema', getContents: () => schemaTemplate(locales) })
    addServerTemplate({ filename: '#atelier-drivers', getContents: () => driversTemplate(nuxt.options.rootDir, resolved.database.url) })
    addServerTemplate({ filename: '#atelier-migrations', getContents: () => migrationsTemplate(nuxt.options.rootDir) })
    addServerPlugin(resolve('./runtime/server/plugins/limits'))
    addServerPlugin(resolve('./runtime/server/plugins/secret'))
    addServerPlugin(resolve('./runtime/server/plugins/migrations'))
    addServerPlugin(resolve('./runtime/server/plugins/shutdown'))
    addServerPlugin(resolve('./runtime/server/plugins/jobs'))

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
    // (the directories are known once every module has had its say: see `atelier:dirs`)
    let blockDirs: string[] = []
    nuxt.hook('modules:done', async () => {
      await collectModuleDirectories(nuxt)
      blockDirs = blockDirectories(nuxt).map(dir => `${dir}/`)
    })

    // the i18n module the site's URLs follow: its locales and strategy, read once every module is set up
    nuxt.hook('modules:done', async () => {
      let chosen: string | undefined
      await nuxt.callHook('atelier:i18n', (module) => {
        chosen = module
      })
      const name = resolved.i18n.module === 'auto'
        ? chosen ?? ['nuxt-i18n-micro', '@nuxtjs/i18n'].find(module => hasNuxtModule(module, nuxt))
        : resolved.i18n.module || undefined
      const adapter = name ? adapterFrom(name, (nuxt.options as { i18n?: Parameters<typeof adapterFrom>[1] }).i18n) : undefined
      if (name && !adapter)
        console.warn(`[nuxt-atelier] i18n: ${name} has no locales configured, so pages ignore it`)
      ;(nuxt.options.runtimeConfig.public.atelier as Record<string, unknown>).i18n = adapter ?? null
    })
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
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/request-id') })
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/csrf') })
    addServerHandler({ middleware: true, handler: resolve('./runtime/server/middleware/redirects') })
    addServerHandler({ route: '/api/_atelier/audit', method: 'get', handler: resolve('./runtime/server/api/audit') })
    addServerHandler({ route: '/api/_atelier/openapi.json', method: 'get', handler: resolve('./runtime/server/api/openapi') })
    addServerHandler({ route: '/api/_atelier/health/live', method: 'get', handler: resolve('./runtime/server/api/health-live') })
    addServerHandler({ route: '/api/_atelier/health/ready', method: 'get', handler: resolve('./runtime/server/api/health-ready') })
    addServerHandler({ route: '/api/_atelier/setup', handler: resolve('./runtime/server/api/setup') })
    addServerHandler({ route: '/api/_atelier/schema', handler: resolve('./runtime/server/api/schema') })
    for (const resource of ['users', 'roles', 'tokens', 'collections', 'singletons', 'redirects']) {
      addServerHandler({ route: `/api/_atelier/${resource}`, handler: resolve(`./runtime/server/api/${resource}`) })
      addServerHandler({ route: `/api/_atelier/${resource}/**`, handler: resolve(`./runtime/server/api/${resource}`) })
    }
    addServerHandler({ route: '/api/_atelier/routes', handler: resolve('./runtime/server/api/routes') })
    addServerHandler({ route: '/api/_atelier/preview-links', handler: resolve('./runtime/server/api/preview-links') })
    addServerHandler({ route: '/api/_atelier/jobs', handler: resolve('./runtime/server/api/jobs') })
    addServerHandler({ route: '/api/_atelier/webhooks', handler: resolve('./runtime/server/api/webhooks') })
    addServerHandler({ route: '/api/_atelier/media', handler: resolve('./runtime/server/api/media') })
    addServerHandler({ route: '/api/_atelier/media/**', handler: resolve('./runtime/server/api/media') })
    addServerHandler({ route: '/_atelier/media/**', handler: resolve('./runtime/server/api/media-files') })
    addServerHandler({ route: '/api/_atelier/webhooks/**', handler: resolve('./runtime/server/api/webhooks') })
    addServerHandler({ route: '/api/_atelier/jobs/**', handler: resolve('./runtime/server/api/jobs') })
    // background jobs: one Nitro task drains the queue, on Nitro's scheduler where the platform has one
    nuxt.hook('nitro:config', (config) => {
      // the task options of Nitro 2 and 3 alike; the fallback config type doesn't declare them
      const nitro = config as unknown as {
        experimental?: Record<string, unknown>
        tasks?: Record<string, { handler: string, description?: string }>
        scheduledTasks?: Record<string, string | string[]>
      }
      nitro.experimental = { ...nitro.experimental, tasks: true }
      nitro.tasks = { ...nitro.tasks, 'atelier:jobs': { handler: resolve('./runtime/server/tasks/jobs'), description: 'Run due Nuxt Atelier background jobs' } }
      if (resolved.jobs.schedule) {
        const cron = resolved.jobs.schedule
        nitro.scheduledTasks = { ...nitro.scheduledTasks, [cron]: [...[nitro.scheduledTasks?.[cron] ?? []].flat(), 'atelier:jobs'] }
      }
    })
    // Nitro 2 runs scheduled tasks on servers, and on Cloudflare for its cron events, but writes no platform
    // schedule: a Vercel cron calls the trigger endpoint (authorized by CRON_SECRET), and Cloudflare gets the
    // cron trigger in the wrangler.json it generates (`cloudflare.deployConfig`)
    nuxt.hook('nitro:init', (instance) => {
      // serverless and edge hosts don't keep files written at runtime: uploads would vanish
      const preset = String((instance.options as { preset?: string }).preset ?? '')
      if (resolved.storage.driver === 'local' && EPHEMERAL.test(preset))
        console.warn(`[nuxt-atelier] Media uploads are stored on the server's disk (storage.driver "local"), which "${preset}" doesn't keep between deploys or share between instances: uploaded files will be lost. Store them in object storage instead (S3, R2, Vercel Blob).`)
    })
    nuxt.hook('nitro:init', (instance) => {
      const schedule = resolved.jobs.schedule
      const options = instance.options as unknown as {
        preset: string
        vercel?: { config?: { crons?: { path: string, schedule: string }[] } }
        cloudflare?: { wrangler?: { triggers?: { crons?: string[] } } }
      }
      if (!schedule)
        return
      if (options.preset.startsWith('vercel')) {
        if (schedule.split(/\s+/).length !== 5)
          return console.warn(`[nuxt-atelier] jobs.schedule "${schedule}" has seconds, which Vercel Cron doesn't take: no cron was added`)
        options.vercel = { ...options.vercel, config: { ...options.vercel?.config, crons: [...options.vercel?.config?.crons ?? [], { path: '/api/_atelier/jobs/run', schedule }] } }
      }
      if (options.preset.startsWith('cloudflare')) {
        const wrangler = options.cloudflare?.wrangler ?? {}
        options.cloudflare = { ...options.cloudflare, wrangler: { ...wrangler, triggers: { ...wrangler.triggers, crons: [...new Set([...wrangler.triggers?.crons ?? [], schedule])] } } }
      }
    })
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
  export const locales: import(${JSON.stringify(resolve('./runtime/shared/locales'))}).Locales
}
declare module '#atelier-blocks' {
  export const blocks: Record<string, { component: () => Promise<import('vue').Component>, areas: string[] }>
}
declare module '#atelier-host-pages' {
  export const pages: { path: string, name?: string, children?: unknown[] }[]
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
