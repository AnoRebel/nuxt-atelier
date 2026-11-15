import type { NuxtModule } from '@nuxt/schema'
import { createResolver, defineNuxtModule, hasNuxtModule, useLogger } from '@nuxt/kit'

export interface ViewportPreset { label: string, width: number }
export interface ModuleOptions {
  /** The preview's widths to switch between (a custom width is always offered). */
  presets?: ViewportPreset[]
}

// the admin's hook, typed here without depending on it
type Hook = (name: string, fn: (list: unknown[]) => void) => void

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxt-atelier/editor',
    configKey: 'atelierEditor',
    compatibility: {
      nuxt: '>=4.6.0',
    },
  },
  defaults: { presets: [{ label: 'Desktop', width: 1280 }, { label: 'Tablet', width: 768 }, { label: 'Mobile', width: 375 }] },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@nuxt-atelier/admin', nuxt))
        useLogger('@nuxt-atelier/editor').warn('The visual editor is part of the admin: add @nuxt-atelier/admin to your modules.')
    })
    // plugins add commands to the editor's palette with `addEditorCommands` from here
    nuxt.options.alias['#atelier-editor'] = resolve('./runtime/commands')
    // the admin shows its "Visual editor" button when this is set
    nuxt.options.runtimeConfig.public.atelierEditor = { presets: options.presets ?? [] }
    ;(nuxt.hook as Hook)('atelier:admin:pages', (pages) => {
      pages.push({ path: 'edit', label: 'Visual editor', icon: 'layout-dashboard', hidden: true, component: resolve('./runtime/VisualEditor.vue') })
    })
  },
})

export default module
