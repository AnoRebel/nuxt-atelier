// The admin: headless composables (TanStack Query and Form) and the default kit, built on crystal-neuo (a
// vendored copy in runtime/crystal-neuo, see scripts/sync-crystal-neuo.ts). Mounted at the core's
// `admin.base` (default `/admin`), client-side only, inside a Shadow DOM root so the site's CSS can't reach
// it and its CSS can't reach the site (see runtime/pages/AdminPage.vue).
//
// Nothing is installed into the app beyond the admin route and its imports: the stylesheet is plain CSS
// adopted by the shadow root, and icons are inline SVG from a set bundled at build time (no icon module,
// nothing fetched from an icon API).
import type { NuxtModule } from '@nuxt/schema'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { addImports, addTemplate, createResolver, defineNuxtModule, extendPages, hasNuxtModule } from '@nuxt/kit'

/** Lucide icons the kit uses (https://lucide.dev), bundled into the admin. */
export const ICONS = [
  'layout-dashboard', 'file-text', 'files', 'settings', 'users', 'shield', 'log-out', 'plus', 'trash-2', 'save',
  'search', 'chevron-left', 'chevron-down', 'chevron-up', 'upload', 'eye', 'eye-off', 'palette', 'key-round',
  'loader-circle', 'check', 'x', 'menu', 'panel-left-open', 'panel-left-close', 'download', 'triangle-alert',
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

const module: NuxtModule = defineNuxtModule({
  meta: {
    name: '@nuxt-atelier/admin',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  setup(_, nuxt) {
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
    nuxt.options.alias['#atelier-admin-icons'] = addTemplate({ filename: 'atelier/admin-icons.mjs', getContents: () => iconsTemplate(ICONS) }).dst

    extendPages((pages) => {
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
    ].map(name => ({ name, from: resolve(`./runtime/composables/${name}`) })))
  },
})

export default module
