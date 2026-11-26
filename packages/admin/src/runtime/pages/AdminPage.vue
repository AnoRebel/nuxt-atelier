<!-- The admin route (`<base>/**`, client-side only). The admin renders in an <atelier-admin> element with an
     open shadow root, fixed over the page: the site's CSS can't reach it (`:host { all: initial }` stops what
     inherits), and its CSS, adopted by the shadow root, never reaches the site. Dialogs open in the top layer
     from inside the same root. -->
<script setup lang="ts">
import { QueryClient, VUE_QUERY_CLIENT } from '@tanstack/vue-query'
import { onBeforeUnmount, provide } from 'vue'
import css from '../admin.css?inline'
import AdminApp from '../components/App.vue'
import { ADMIN_PORTAL } from '../composables/useAtelierAdminPortal'
import { adoptAdminStyles } from '../styles'

const host = document.createElement('atelier-admin')
const shadow = host.attachShadow({ mode: 'open' })
const sheet = new CSSStyleSheet()
sheet.replaceSync(css)
shadow.adoptedStyleSheets = [sheet]
const stopStyles = adoptAdminStyles(shadow) // the app's own pages' and overrides' <style>, after the admin's
const root = document.createElement('div')
root.setAttribute('data-atelier-admin', '')
const portal = document.createElement('div')
portal.setAttribute('data-atelier-admin-portal', '')
root.append(portal) // inside the root: overlays get the appearance and theme tokens too
shadow.append(root)
document.body.append(host)
provide(ADMIN_PORTAL, portal)

// in development: say so when an overlay lands on the page's <body>, outside the admin, where it's unstyled
let watcher: MutationObserver | undefined
if (import.meta.dev) {
  watcher = new MutationObserver(records => records.flatMap(r => [...r.addedNodes]).forEach((node) => {
    if (node instanceof HTMLElement && node !== host && (node.matches('[role="dialog"], [role="menu"], [role="listbox"], [popover], [data-radix-popper-content-wrapper], [data-reka-popper-content-wrapper]') || node.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')))
      console.warn('[@nuxt-atelier/admin] An overlay was added to the page\'s <body>, outside the admin, where its styles don\'t apply. Render it in the admin with useAtelierAdminPortal() as its teleport target.', node)
  }))
  watcher.observe(document.body, { childList: true })
}
const overflow = document.body.style.overflow
document.body.style.overflow = 'hidden' // the page under the admin doesn't scroll

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => count < 2 && ((error as { status?: number }).status ?? 500) >= 500, refetchOnWindowFocus: false },
  },
})
client.mount()
provide(VUE_QUERY_CLIENT, client)

onBeforeUnmount(() => {
  watcher?.disconnect()
  stopStyles()
  client.unmount()
  host.remove()
  document.body.style.overflow = overflow
})
</script>

<template>
  <!-- one root element, as Nuxt wants of a page; the admin itself is teleported into its shadow root -->
  <div
    data-atelier-admin-page
    hidden
  >
    <Teleport :to="root">
      <AdminApp :root="root" />
    </Teleport>
  </div>
</template>
