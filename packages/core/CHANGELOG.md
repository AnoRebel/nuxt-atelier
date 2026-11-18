# nuxt-atelier

## 0.1.1

### Patch Changes

- 9bb03ca: The form editor shows each field's settings only for the types that use them (options for select and radio, a pattern for text…), with help text, and the label in other languages as one input per locale (none on a single-language site) instead of JSON. `newBlock` (a new block with its defaults) moves to the shared blocks helpers.
- 6e21e3a: `<AtelierForm>` sends the CSRF header a signed-in browser needs: people signed in to the admin could not send the site's forms (refused with "the x-atelier-csrf header is missing or wrong").

## 0.1.0

### Minor Changes

- 7b09c1d: First release: content types (collections, singletons, routable pages) defined in TypeScript, block components registered from `defineBlock()`, migrations for SQLite, libSQL, D1, Postgres, MySQL and MariaDB, drafts, history, scheduling and background jobs, media with image variants, the built-in sign-in with passkeys, a typed content API with OpenAPI, server-rendered page metadata and JSON-LD, localized collections, reusable content (shared blocks, patterns, entry templates), several sites from one deployment (by host, with per-site content, media, search, sitemaps, tokens and roles), public forms (the form block, private uploads, spam protection with Turnstile, submissions with export and erasure), editorial collaboration (edit locks, presence, comments, notifications over WebSocket with a polling fallback, email through SMTP, Resend or Postmark), health endpoints, structured logs and security headers.
