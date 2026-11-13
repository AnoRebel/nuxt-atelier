// An example Nuxt Atelier plugin shipped as a Nuxt module: an `events` collection with its own field type,
// a block, a lifecycle hook and a background job, and in the admin: a page, its text, and an input for its
// field type.
import type {} from '@nuxt-atelier/admin' // the atelier:admin:* hooks
import { addComponent, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

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

    // the admin: a page of its own, its text (English here; a translation adds its own language), and the
    // input every geo-point field gets (a component named after the field type, see the admin's overrides)
    nuxt.hook('atelier:admin:pages', (pages) => {
      pages.push({ path: 'events/calendar', label: 'Event calendar', icon: 'calendar', group: 'Events', component: resolve('./runtime/admin/EventCalendar.vue') })
    })
    nuxt.hook('atelier:admin:languages', (languages) => {
      languages.en = { name: 'English', messages: [languages.en?.messages ?? [], resolve('./runtime/admin/en.json')].flat() }
    })
    addComponent({ name: 'AtelierAdminFieldGeoPoint', filePath: resolve('./runtime/admin/GeoPointInput.vue'), global: true })
  },
})
