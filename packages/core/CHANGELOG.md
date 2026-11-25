# nuxt-atelier

## 0.2.0

### Minor Changes

- 113eee9: Node.js 22 is no longer supported or tested: Nuxt Atelier supports Node 24 and 26. (Node 22 is in maintenance until April 2027; with Nuxt 4.7 it fails one of its own internal checks while building an app with the DevTools integration.)
- 1e75d87: A CMS page's layout is now rendered by your app's `<NuxtLayout>`, like any other page, instead of by the catch-all page itself. The type's `route.layout` is set on the route before it renders, so props and attributes you give `<NuxtLayout>` reach it, an explicit `name` (a layout chosen at runtime) wins without wrapping the page twice, and `setPageLayout(name, props)` in a global middleware or plugin applies. The page reads the route the layout middleware already fetched, so there's still one request per page.
  
  Your `app.vue` needs a `<NuxtLayout>` around `<NuxtPage />` for layouts to apply, as it already does for your own pages; Nuxt's default `app.vue` has one. A pass-through layout used to avoid double layouts (`<slot />`) can go.

### Patch Changes

- 2c1695b: A reply saved in the same millisecond as its thread's first comment is listed after it on every database, not in random order.
- c1c08f7: With `auth.passkeys` on, the build stops early and names `@simplewebauthn/server` or `@simplewebauthn/browser` if either isn't installed, instead of failing in the bundler. The installation and authentication docs list both packages.
- dd93c0d: The published types are typed again. `defineBlock` and the field helpers from `#atelier` lost their declarations to a same-named internal shim, so props built from them were untyped. `useAtelierQuery`, `useAtelierEntry`, `useAtelierSingleton`, `useAtelierRouteEntry` and `useAtelierSiteSearch` were declared as returning `any`.
- dee31ad: `@vue/compiler-sfc`, which reads your blocks, is now `^3.5.46` instead of an exact version, so it dedupes with your app's Vue. Tested with Nuxt 4.7.0 and Vue 3.5.46.

## 0.1.1

### Patch Changes

- 9bb03ca: The form editor shows each field's settings only for the types that use them (options for select and radio, a pattern for text…), with help text, and the label in other languages as one input per locale (none on a single-language site) instead of JSON. `newBlock` (a new block with its defaults) moves to the shared blocks helpers.
- 6e21e3a: `<AtelierForm>` sends the CSRF header a signed-in browser needs: people signed in to the admin could not send the site's forms (refused with "the x-atelier-csrf header is missing or wrong").

## 0.1.0

### Minor Changes

- 7b09c1d: First release: content types (collections, singletons, routable pages) defined in TypeScript, block components registered from `defineBlock()`, migrations for SQLite, libSQL, D1, Postgres, MySQL and MariaDB, drafts, history, scheduling and background jobs, media with image variants, the built-in sign-in with passkeys, a typed content API with OpenAPI, server-rendered page metadata and JSON-LD, localized collections, reusable content (shared blocks, patterns, entry templates), several sites from one deployment (by host, with per-site content, media, search, sitemaps, tokens and roles), public forms (the form block, private uploads, spam protection with Turnstile, submissions with export and erasure), editorial collaboration (edit locks, presence, comments, notifications over WebSocket with a polling fallback, email through SMTP, Resend or Postmark), health endpoints, structured logs and security headers.
