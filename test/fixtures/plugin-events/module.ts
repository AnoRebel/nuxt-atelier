// An example Nuxt Atelier plugin shipped as a Nuxt module: an `events` collection with its own field type,
// a block, a lifecycle hook and a background job.
import { addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'atelier-events' },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // content definitions and blocks, laid out like a layer: content/server/atelier, content/app/blocks
    nuxt.hook('atelier:dirs', (dirs) => {
      dirs.push(resolve('./content'))
    })
    // hooks and jobs: a server plugin
    addServerPlugin(resolve('./runtime/plugin'))
  },
})
