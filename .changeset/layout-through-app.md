---
"nuxt-atelier": minor
---

A CMS page's layout is now rendered by your app's `<NuxtLayout>`, like any other page, instead of by the catch-all page itself. The type's `route.layout` is set on the route before it renders, so props and attributes you give `<NuxtLayout>` reach it, an explicit `name` (a layout chosen at runtime) wins without wrapping the page twice, and `setPageLayout(name, props)` in a global middleware or plugin applies. The page reads the route the layout middleware already fetched, so there's still one request per page.

Your `app.vue` needs a `<NuxtLayout>` around `<NuxtPage />` for layouts to apply, as it already does for your own pages; Nuxt's default `app.vue` has one. A pass-through layout used to avoid double layouts (`<slot />`) can go.
