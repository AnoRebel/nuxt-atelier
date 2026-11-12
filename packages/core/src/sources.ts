// Where content definitions and blocks come from: the app and each layer, highest priority first, then the
// directories Nuxt modules add with the `atelier:dirs` hook (plugins shipped as modules rather than layers).
// Each holds `server/atelier/…` and `app/blocks/`, as a layer does.
import type { Nuxt } from '@nuxt/schema'
import { join } from 'node:path'
import { getLayerDirectories, useNuxt } from '@nuxt/kit'

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /**
     * Add directories laid out like a layer (`server/atelier/collections/…`, `app/blocks/…`) for Nuxt
     * Atelier to read, after the app's and its layers'. For plugins distributed as Nuxt modules.
     */
    'atelier:dirs': (dirs: string[]) => void | Promise<void>
    /**
     * Pick the i18n module the site's URLs follow (`nuxt-i18n-micro`, `@nuxtjs/i18n`): what the adapter
     * packages do. The `atelier.i18n.module` option, when not `auto`, wins.
     */
    'atelier:i18n': (choose: (module: string) => void) => void | Promise<void>
  }
}

// kept on the Nuxt instance under a global symbol: the module and the CLI may be different copies of this
// file (source and build), and must still see the same directories
const ADDED = Symbol.for('nuxt-atelier:dirs')
type WithDirs = Nuxt & { [ADDED]?: string[] }

/** Asks modules for their directories (once modules are set up), keeping them for discovery. */
export async function collectModuleDirectories(nuxt: Nuxt): Promise<void> {
  const dirs: string[] = []
  await nuxt.callHook('atelier:dirs', dirs)
  ;(nuxt as WithDirs)[ADDED] = dirs
}

/** The app's and layers' `app` and `server` directories, then the modules' added ones. */
export function contentDirectories(nuxt: Nuxt = useNuxt()): { app: string, server: string }[] {
  return [
    ...getLayerDirectories(nuxt).map(layer => ({ app: layer.app, server: layer.server })),
    ...((nuxt as WithDirs)[ADDED] ?? []).map(root => ({ app: join(root, 'app'), server: join(root, 'server') })),
  ]
}
