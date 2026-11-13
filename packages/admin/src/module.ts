// The admin: headless composables (TanStack Query and Form) and the default kit, built on crystal-neuo (a
// vendored copy in runtime/crystal-neuo, see scripts/sync-crystal-neuo.ts). Mounted at the core's
// `admin.base` (default `/admin`), client-side only, inside a Shadow DOM root so the site's CSS can't reach
// it and its CSS can't reach the site (see runtime/pages/AdminPage.vue).
//
// Nothing is installed into the app beyond the admin route and its imports: the stylesheet is plain CSS
// adopted by the shadow root, and icons are inline SVG from a set bundled at build time (no icon module,
// nothing fetched from an icon API).
import type { NuxtModule } from '@nuxt/schema'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { addComponentsDir, addImports, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, extendPages, getLayerDirectories, hasNuxtModule, resolvePath } from '@nuxt/kit'

/** Lucide icons the kit uses (https://lucide.dev), bundled into the admin. */
export const ICONS = [
  'layout-dashboard', 'file-text', 'files', 'settings', 'users', 'shield', 'log-out', 'plus', 'trash-2', 'save',
  'search', 'chevron-left', 'chevron-down', 'chevron-up', 'upload', 'eye', 'eye-off', 'palette', 'key-round',
  'loader-circle', 'check', 'x', 'menu', 'panel-left-open', 'panel-left-close', 'download', 'triangle-alert',
  'image', 'lock', 'file', 'film', 'music',
  'bold', 'italic', 'underline', 'strikethrough', 'code', 'heading-2', 'heading-3', 'list', 'list-ordered',
  'quote', 'square-code', 'link', 'unlink', 'undo-2', 'redo-2',
]

interface IconSet { icons: Record<string, { body: string, width?: number, height?: number }>, aliases?: Record<string, { parent: string }>, width?: number, height?: number }

/** `export default { name: { body, width, height } }` for the listed icons. */
function iconsTemplate(names: readonly string[]): string {
  const require = createRequire(import.meta.url)
  const set = JSON.parse(readFileSync(require.resolve('@iconify-json/lucide/icons.json'), 'utf8')) as IconSet
  const picked = Object.fromEntries(names.map((name) => {
    const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? '']
    if (!icon)
      throw new Error(`[@nuxt-atelier/admin] No Lucide icon "${name}"`)
    return [name, { body: icon.body, width: icon.width ?? set.width ?? 24, height: icon.height ?? set.height ?? 24 }]
  }))
  return `export default ${JSON.stringify(picked)}\n`
}

/** An admin page of the app or a plugin, in the admin's navigation. */
export interface AdminPage {
  /** Its path under the admin's base: `settings` is `/admin/settings`. */
  path: string
  label: string
  /** A Lucide icon name (`settings`); it must be one the admin bundles, or listed in `icons`. */
  icon?: string
  /** Navigation group; pages without one go under "Tools". */
  group?: string
  /** Lower first. */
  order?: number
  /** Admin areas a user must manage to see the page (any one of them). */
  requires?: string | string[]
  /** The page component: a path, `~/` for the app. */
  component: string
}

/** An admin interface language: its own name, and its messages (JSON files, merged in order). */
export interface AdminLanguage {
  /** Its name in that language: `Deutsch`. */
  name: string
  /** Catalog files (`~/admin-i18n/de.json`); a key missing from them shows in English. */
  messages: string | string[]
}

export interface ModuleOptions {
  /**
   * Admin interface languages by code (`de`, `pt-br`), loaded when someone picks one. English ships with the
   * admin; giving `en` adds to or changes its text. Plugins add theirs with the `atelier:admin:languages` hook.
   */
  languages?: Record<string, AdminLanguage>
  /** Pages added to the admin. Plugins add theirs with the `atelier:admin:pages` hook. */
  pages?: AdminPage[]
  /** More Lucide icons to bundle, for custom pages and content types. */
  icons?: string[]
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /** Add or change admin pages: plugins push theirs. */
    'atelier:admin:pages': (pages: AdminPage[]) => void | Promise<void>
    /** Add admin interface languages, or messages to one (a plugin's own pages' text). */
    'atelier:admin:languages': (languages: Record<string, AdminLanguage>) => void | Promise<void>
  }
}

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxt-atelier/admin',
    configKey: 'atelierAdmin',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  defaults: { pages: [], icons: [], languages: {} },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // the core's options as written, so the order of the two modules doesn't matter
    const core = (nuxt.options as { atelier?: { admin?: { base?: string }, auth?: { passkeys?: boolean } } }).atelier
    const base = core?.admin?.base ?? '/admin'
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('nuxt-atelier', nuxt))
        console.warn('[@nuxt-atelier/admin] nuxt-atelier isn\'t installed: add it to `modules` too')
    })

    // client-side only, never indexed or prerendered
    const rules = nuxt.options.routeRules as Record<string, { ssr?: boolean, headers?: Record<string, string> }>
    for (const path of [base, `${base}/**`])
      rules[path] = { ...rules[path], ssr: false, headers: { ...rules[path]?.headers, 'x-robots-tag': 'noindex, nofollow' } }
    nuxt.options.nitro.prerender ??= {}
    nuxt.options.nitro.prerender.ignore = [...nuxt.options.nitro.prerender.ignore ?? [], base]

    // passkey sign-in code only when passkeys are on: otherwise @simplewebauthn/browser isn't even resolved
    nuxt.options.alias['#atelier-admin-passkeys'] = resolve(core?.auth?.passkeys === true ? './runtime/passkeys' : './runtime/passkeys-off')
    // icons: the kit's, the pages', and `icons` (for content types' `admin.icon`, say)
    const pages: AdminPage[] = [...options.pages ?? []]
    const languages: Record<string, AdminLanguage> = { ...options.languages }
    nuxt.hook('modules:done', async () => {
      await nuxt.callHook('atelier:admin:pages', pages)
      await nuxt.callHook('atelier:admin:languages', languages)
    })
    nuxt.options.alias['#atelier-admin-icons'] = addTemplate({
      filename: 'atelier/admin-icons.mjs',
      getContents: () => iconsTemplate([...new Set([...ICONS, ...options.icons ?? [], ...pages.flatMap(p => p.icon ? [p.icon] : [])])]),
    }).dst

    // custom pages, loaded when opened
    nuxt.options.alias['#atelier-admin-pages'] = addTemplate({
      filename: 'atelier/admin-pages.mjs',
      getContents: async () => {
        const entries = await Promise.all(pages.map(async ({ component, ...page }) =>
          `  { ...${JSON.stringify({ ...page, requires: [page.requires ?? []].flat() })}, component: () => import(${JSON.stringify(await resolvePath(component))}) },`))
        return `export default [\n${entries.join('\n')}\n]\n`
      },
    }).dst
    // admin languages, each loaded when chosen
    nuxt.options.alias['#atelier-admin-languages'] = addTemplate({
      filename: 'atelier/admin-languages.mjs',
      getContents: async () => {
        const entries = await Promise.all(Object.entries(languages).map(async ([code, { name, messages }]) => {
          const files = await Promise.all([messages].flat().map(file => resolvePath(file)))
          return `  { code: ${JSON.stringify(code.toLowerCase())}, name: ${JSON.stringify(name)}, messages: [${files.map(f => `() => import(${JSON.stringify(f)})`).join(', ')}] },`
        }))
        return `export default [\n${entries.join('\n')}\n]\n`
      },
    }).dst
    addTypeTemplate({
      filename: 'types/atelier-admin.d.ts',
      getContents: () => `declare module '#atelier-admin-pages' {
  const pages: { path: string, label: string, icon?: string, group?: string, order?: number, requires: string[], component: () => Promise<{ default: import('vue').Component }> }[]
  export default pages
}
declare module '#atelier-admin-languages' {
  const languages: { code: string, name: string, messages: (() => Promise<{ default: Record<string, string> }>)[] }[]
  export default languages
}
declare module '#atelier-admin-icons' {
  const icons: Record<string, { body: string, width: number, height: number }>
  export default icons
}
declare module '#atelier-admin-passkeys' {
  export function signInWithPasskey(): Promise<unknown>
}
`,
    })

    // overrides: app/atelier-admin/<Name>.vue in the app or a layer replaces the kit's <Name> (a view, or a
    // field input like FieldDate), registered as the global component AtelierAdmin<Name>; the app wins
    const layers = getLayerDirectories(nuxt)
    layers.forEach((layer, i) => {
      const dir = join(layer.app, 'atelier-admin')
      if (existsSync(dir))
        addComponentsDir({ path: dir, prefix: 'AtelierAdmin', global: true, priority: layers.length - i })
    })

    extendPages((pages) => {
      // an app page at the admin's path would be hidden by the admin, or hide it
      const taken = pages.filter(p => p.path === base || p.path.startsWith(`${base}/`)).map(p => p.path)
      if (taken.length)
        console.warn(`[@nuxt-atelier/admin] The admin is at ${base}, where the app has pages too (${taken.join(', ')}). Move the admin elsewhere with \`atelier: { admin: { base: '/studio' } }\` in nuxt.config.`)
      pages.push({ name: 'atelier-admin', path: `${base}/:path(.*)*`, file: resolve('./runtime/pages/AdminPage.vue'), meta: { layout: false, atelier: 'admin' } })
    })

    // the headless layer: usable by any kit, the default one included
    addImports([
      'useAtelierAdmin',
      'useAtelierSession',
      'useAtelierAdminSchema',
      'useAtelierPermissions',
      'useAtelierNavigation',
      'useAtelierCollection',
      'useAtelierEntryForm',
      'useAtelierUsers',
      'useAtelierRoles',
      'useAtelierAdminPortal',
      'useAtelierDashboard',
      'useAtelierSetting',
      'useAtelierGlobalSearch',
    ].map(name => ({ name, from: resolve(`./runtime/composables/${name}`) })))
    addImports({ name: 'useAdminI18n', from: resolve('./runtime/i18n') })
  },
})

export default module
