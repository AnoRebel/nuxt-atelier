<!-- The admin route (`<base>/**`, client-side only). The admin renders in an <atelier-admin> element with an
     open shadow root, fixed over the page: the site's CSS can't reach it (`:host { all: initial }` stops what
     inherits), and its CSS, adopted by the shadow root, never reaches the site. Dialogs open in the top layer
     from inside the same root. -->
<script setup lang="ts">
import { QueryClient, VUE_QUERY_CLIENT } from '@tanstack/vue-query'
import { onBeforeUnmount, provide } from 'vue'
import css from '../admin.css?inline'
import AdminApp from '../components/App.vue'

const host = document.createElement('atelier-admin')
const shadow = host.attachShadow({ mode: 'open' })
const sheet = new CSSStyleSheet()
sheet.replaceSync(css)
shadow.adoptedStyleSheets = [sheet]
const root = document.createElement('div')
root.setAttribute('data-atelier-admin', '')
shadow.append(root)
document.body.append(host)
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
  client.unmount()
  host.remove()
  document.body.style.overflow = overflow
})
</script>

<template>
  <Teleport :to="root">
    <AdminApp :root="root" />
  </Teleport>
</template>
