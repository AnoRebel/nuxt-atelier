# Design

## Context

This is a greenfield repository. Motivation is in proposal.md (Why), and the behaviour contract is in `specs/*`. The research that shaped this design looked at blökkli `2.0.0-alpha.74`, Pruvious `3.16.1`/`4.0.0-alpha.8`, and Nuxt `4.6.3`.

The constraints the design must respect:

- **Nuxt floor.** Nuxt ≥4.6 (Node `^22.22.3 || ^24.15.0 || >=26`), and the project must keep working on Nuxt 5 (Q4 2026: Nitro v3, h3 v2, Rolldown, no bundled `jiti`, compiled JS only).
- **Public APIs only.** The upstream breakages we are designing around:
  - blökkli: direct mutation of `nuxt.options`, and dependence on `@vitejs/plugin-vue` id formats.
  - Pruvious: access to the private `_layers`, rewriting tsconfig files, taking over `app.vue`, and disabling stylesheets at runtime.
- **Lean, safe, bounded.** Performance, safety and resource management are first-class. Every dependency must justify its weight, and optional features cost nothing when disabled.
- **Mandated libraries:**
  - `date-fns` + `@date-fns/tz` for all date work.
  - TanStack Form (v1, no adapter) + Valibot for all forms and validation.
  - VueUse for utilities.
  - TanStack Query and TanStack Charts where needed.
  - Nuxt UI as the default admin kit.
  - Docus for documentation.
  - Bun workspaces, MIT license.
- **Naming.** The product is **Nuxt Atelier**. The fixed identifiers:

  | What | Value |
  |---|---|
  | Main package | `nuxt-atelier` |
  | Other packages | `@nuxt-atelier/*` |
  | Config key | `atelier` |
  | Aliases | `#atelier`, `#atelier/server` |
  | Components and composables | `Atelier*`, `useAtelier*` |
  | CSS prefix | `.at-*` / `--at-*` |
  | API base | `/api/_atelier/**` |
  | Environment variables | `NUXT_ATELIER_*` |

## Goals / Non-Goals

**Goals:**
- A single coherent architecture where the built-in backend is just one implementation of the public content adapter contract.
- Zero reliance on undocumented Nuxt, Nitro or Vite internals, enforced by CI. Runs on Nuxt 4.6+ and Nuxt 5 from the same build.
- Zero editor or admin bytes on public pages. A visual editor that works with any UI library the site uses.
- Measurable budgets, defined in the `runtime-performance` spec, that are enforced in CI.

**Non-Goals:**
- Real-time collaborative co-editing (CRDT/OT). Collaboration is limited to locking, presence and comments.
- Building a UI kit for shadcn-vue or plain CSS for the admin. The headless admin contract makes this possible; the community or later releases can build one.
- A hosted SaaS, a deploy manager, or a cloud dashboard (unlike the Pruvious Hub).
- Supporting Nuxt <4.6 or Nuxt 3.
- Vue-only (non-Nuxt) usage.
- Automatic migration of Pruvious or blökkli content. Possible later as importer plugins.

## Decisions

### D1. Repository layout and packages
Bun workspace:

```
packages/
  core/            → nuxt-atelier          (module: schema, server, renderer, CLI, bridge client)
  admin/           → @nuxt-atelier/admin   (headless composables + Nuxt UI kit)
  editor/          → @nuxt-atelier/editor  (visual editor host: preview frame, DnD, history)
  layer/           → @nuxt-atelier/layer   (optional starter layer: overridable admin pages/theme)
  auth-better-auth/, i18n-micro/, i18n-nuxtjs/, storage-s3/, storage-vercel-blob/, ai/  (adapters)
playground/        (dev app exercising every feature, multiple DBs via env)
docs/              (Docus: extends docus, modules: ['nuxt-atelier', '@nuxt-atelier/admin'])
test/fixtures/     (minimal apps: plain-css, shadcn, nuxt-ui, layers, multi-site, i18n)
```

- **Why separate packages:** the core stays installable headless. Adapters carry their own heavy optional dependencies (Better Auth, the AI SDK, S3 signing). This satisfies the "optional features cost nothing" constraint.
- **Alternative considered:** a single package with optional peer dependencies. Rejected because missing optional dependencies produce confusing errors and mixed bundles.

### D2. Module + optional layer using only public `@nuxt/kit`
- **Main entry:** `defineNuxtModule` with `meta.compatibility.nuxt: '>=4.6.0'` and `meta.compatibility.server: 'nuxt'`.
- **Dependencies:** `@nuxt/kit ^4.6` goes in `dependencies`, as Nuxt requires for server variants. Optional modules (`@nuxt/ui`, i18n modules, `@nuxtjs/sitemap`) are declared with `moduleDependencies`, not `installModule`.
- **Allowed kit APIs:**
  - `addComponentsDir` with prefix `Atelier`
  - `addImports`
  - `addServerHandler` / `addNitroPlugin` / `addServerImports`, with `{nuxt, nitro2, nitro3}` variants where `nuxt/server` lacks coverage
  - `addTemplate` / `addTypeTemplate` / `addServerTemplate`
  - `extendPages` for the admin and the catch-all
  - `addRouteMiddleware`
  - `addVitePlugin`
  - `getLayerDirectories`
  - `createResolver`
  - `useNuxt().hook('builder:watch')`
- **Forbidden, and enforced by a lint rule:**
  - imports from `#build/*`, `nuxt/dist/*`, `nitropack/runtime/internal/*`
  - any `nuxt.options._*`
  - writing outside `buildDir`
  - patching generated tsconfig files
  - relying on plugin-vue sub-module ids
- **Server code** is written against `nuxt/server` (`RequestEvent`, `defineHandler`, `readValidatedBody`, `useSession`, `serverFetch`). Storage, cache and Nitro plugins register as `nitro2` and `nitro3` variants until `nuxt/server` covers them.
- **Packaging:** ships compiled `.mjs` via `@nuxt/module-builder`. The layer's `nuxt.config` is emitted as `.mjs` for Nuxt 5.
- **Alternative considered:** layer-first, like Pruvious v4 and Docus. Rejected as the primary entry because it can't do conditional registration or typed options, and it is what drove the `app.vue` takeover.

### D3. Schema definition and build-time extraction
- **Server definitions:** collections and singletons live in `server/atelier/collections/*.ts` and `server/atelier/singletons/*.ts`, using `defineCollection` / `defineSingleton` imported from `#atelier/server`.
  - These run on the server as real code; no static extraction is needed.
  - Field helpers produce a plain serialisable descriptor plus a Valibot schema.
- **Blocks: two supported styles.**
  - **Macro style:** `app/blocks/**/*.vue` calls `defineBlock({...})` imported from `#atelier`, with field helpers inside `defineProps`.
  - **Schema-file style:** `app/blocks/**/*.block.ts` calls `defineBlock({ component, fields })`. The component may be any import, including third-party.
- **Macro extraction:**
  1. Parse with `@vue/compiler-sfc` (`parse` and `compileScript` metadata only) and `oxc-parser`.
  2. Statically evaluate *literal* object expressions and calls to known field helpers.
  3. Anything else fails with a file:line diagnostic. No `eval` or `new Function`, unlike Pruvious v3.
  4. A `transform` hook (Vite plugin via `addVitePlugin`) replaces the macro call with `undefined` and rewrites field-helper calls in `defineProps` to plain Vue prop declarations, using `magic-string` for sourcemaps. It works only on the SFC source the plugin receives (`id` ending `.vue` without a query), never on plugin-vue sub-module ids.
- **Generated output (via `addTemplate` / `addServerTemplate`):**
  - a block registry: name → lazy component import + serialisable schema
  - server validators built from the schemas
  - types via `addTypeTemplate`
  - Templates regenerate on `builder:watch`, and Nuxt HMR picks up template changes through its public mechanism, with no captured Vite servers.
- **Layer overrides:** layers come from `getLayerDirectories()`, in priority order. On a same-name block, the highest priority wins and the override is logged in debug mode, never as an error. This fixes blökkli #54.
- **Defaults:** compiled to factory functions so every block instance gets a fresh copy. This fixes Pruvious #154.
- **Field helpers in `defineProps`** come from `#atelier`, typed as Vue props: each returns `{ type: PropType<value>, '~field': descriptor }`. So `defineProps({ title: text({ required: true }) })` type-checks and gives a typed `title`. A field descriptor's own `type: 'text'` can't be a Vue prop type, so the server's helpers (`#atelier/server`) stay descriptors.
- **Rendering:**
  - A block's fields and options are its props; each nested area is the component's slot of the same name. Areas are stored as block props holding block lists, as the content adapter contract already has them.
  - The app registry (`#atelier-blocks`) holds only lazy component imports and area names; schemas go to the server in `#atelier-schema`.
  - `#components` references in `.block.ts` files resolve to the component's file through `components:extend`, since Nuxt rewrites only static `#components` imports.
- **Reconciliation:** content is never blocked by stale schema data.
  - Validation keeps props a block no longer declares and blocks of unknown types, treats an area added since as empty, and keeps unknown keys inside objects and repeater items (top-level unknown keys are still refused).
  - `findStaleContent()` reports these; `contentRepairs` drops or moves them.

### D4. Validation and forms
- **Validation:** Valibot 1.5 is the single validation engine. Field helpers compose Valibot schemas, and the server validates every write with them.
- **Standard Schema:** custom validators may be any Standard Schema (`@standard-schema/spec`), so users can still use Zod.
- **Forms:** every form, in the admin and the public form block, uses `@tanstack/vue-form` 1.x with Valibot schemas passed directly as validators. TanStack Form ≥1 accepts Standard Schema natively, so no adapter package is used.
- **Shared rules:** the same schema runs on client and server, so the two can never drift.

### D5. Storage: Drizzle 1.0 RC behind a driver interface
- **ORM:** `drizzle-orm` / `drizzle-kit` pinned to an exact `1.0.0-rc.x`, to avoid a forced 0.x → 1.0 migration later.
- **Drivers:**

  | Database | Driver |
  |---|---|
  | SQLite / libSQL / Turso | `@libsql/client` (local file or remote; Node, Bun, Deno) |
  | PostgreSQL | `pg` (most widely supported across runtimes and drivers; `postgres@4.0.0` was released two days before this research and is untested with Drizzle) |
  | MySQL / MariaDB | `mysql2` |
  | Local dev, zero install | SQLite file under `.data/` (git-ignored) |
  | D1 | Drizzle's D1 driver, only behind a capability flag; see the risk below |

- **Tables:** generated from the schema descriptors into Drizzle table definitions.
- **Storage model:**
  - One `entries` table per collection with typed columns for scalar fields.
  - Block trees and complex fields stored as JSON columns on the revision row.
  - Normalised side tables for relations, routes, search, locks, comments, jobs, media and audit.
  - **Why JSON for block trees:** atomic snapshot per revision, a single query per entry load (supports the "bounded queries" requirement), simple diff and restore.
  - **Alternative considered:** a fully normalised block table, like blökkli/Drupal paragraphs. Rejected: N+1 risk and complex revisioning.
- **Migrations:**
  - The CLI wraps `drizzle-kit generate` and writes into `server/atelier/migrations/`, committed to the repo.
  - A custom guard rejects drop or rename statements unless they are annotated, because drizzle-kit can't know intent.
  - Dev auto-applies non-destructive changes. Production applies only through `atelier migrate` or the opt-in `migrations.autoApply`.
- **Concurrency:** optimistic, using a `version` integer column.
- **Content adapter contract:** a versioned TypeScript interface published from `nuxt-atelier/adapter`. Built-in = `createDatabaseAdapter()`. A capability map (`adapter.capabilities`) drives feature toggles, borrowing blökkli's `requiredAdapterMethods` idea.

### D6. Visual editor: same-origin iframe + typed bridge
- **Pages involved:**
  - **Parent:** the admin route, which hosts the editor (`@nuxt-atelier/editor`).
  - **Child:** the real site route in an `<iframe>` with `?_atelier=preview` plus a short-lived HMAC-signed preview token (from `deriveSecret`), exchanged for an HTTP-only preview cookie scoped to the session.
- **Loading the bridge:**
  - A tiny client plugin in core checks for the preview cookie or flag.
  - Only then does it `import()` the bridge client chunk. Public visitors never download it.
  - Editing data attributes (`data-at-block`, `data-at-field`) are emitted by `<AtelierBlocks>` and `<AtelierField>` only when the preview context is active.
  - So blocks need no editor code, and there's no dual compilation, unlike blökkli's editing-variant SFCs.
- **Protocol:**
  - versioned message types validated with Valibot
  - origin checked against the configured admin origin
  - parent → child: edit-state patches
  - child → parent: geometry, selection and inline edits
  - The child renders from an in-memory reactive edit state fed by patches (Pruvious v4 approach). The server isn't hit per keystroke.
- **Overlay:** selection, hover and drop indicators are drawn in the *parent* over the iframe, using geometry the child reports through `ResizeObserver` and `MutationObserver` (VueUse `useResizeObserver`/`useMutationObserver`). This needs no CSS injected into the site, so there are no style collisions.
- **Drag and drop:** `@atlaskit/pragmatic-drag-and-drop` 4.x for the structure tree and block picker. In-preview dragging uses pointer events relayed through the bridge, with drop zones computed from the reported geometry.
  - **Why this library:** headless, small, framework-agnostic and accessible-friendly.
  - **Alternatives considered:** SortableJS, which manipulates the DOM directly and conflicts with Vue, and `@formkit/drag-and-drop` 0.x, which is pre-1.0.
- **Undo/redo:** a command-pattern history of edit operations in the parent, coalescing keystrokes.
- **Proxy mode:** a block opts in with `editor.proxy: true`; its children are then edited in a panel list.
- **Responsive preview:** the iframe width changes, with presets set in config.

### D7. Admin: headless core + Nuxt UI kit in a Shadow DOM root
- **Headless layer:** `@nuxt-atelier/admin` exports headless composables (`useAtelierCollection`, `useAtelierEntryForm`, `useAtelierPermissions`, …) built on:
  - TanStack Query (`@tanstack/vue-query` 5.x) for server-state caching, mutations and optimistic updates
  - TanStack Form for forms
- **Kit:** the default Nuxt UI 4 kit consumes those composables.
- **Mounting:** `extendPages` adds `${base}/**` with `ssr: false` route rules and `robots: noindex`. The page component teleports a fixed, full-viewport custom element `<atelier-admin>` with an **open Shadow DOM** to `body`.
  - Admin CSS (Tailwind v4 + Nuxt UI, compiled at module build time) is applied with `adoptedStyleSheets` inside the shadow root.
  - Tailwind v4 `@property` registrations are also adopted on the admin document, since `@property` is ignored in shadow roots. This is a documented Tailwind limitation, and it's safe here because only the admin is rendered in that document; the site lives in the iframe.
  - `UApp` receives `portal` = an element inside the shadow root, so modals, popovers, toasts and tooltips stay isolated. Nuxt UI documents `portal: string | boolean | HTMLElement`.
  - `:host { all: initial }` blocks inherited properties.
- **Result:** host global CSS can't reach admin chrome, and admin CSS never reaches public pages. The host's `app.vue` is never touched, and there's no stylesheet-disabling hack like Pruvious's #148 and #153.
- **Alternatives considered:**
  - cascade layers alone: unlayered host CSS beats layered admin CSS
  - a separate prebuilt SPA: loses "custom admin pages are plain Vue in your app"
  - an iframe-wrapped admin: double-iframe editor, focus and keyboard problems
- **Overrides:** components resolve through a registry, keyed by name, that host and layer components override. App-config-driven theming maps to `--at-*` and `--ui-*` tokens.
- **Charts:** dashboard charts use `@tanstack/vue-charts` 1.x, the same engine as Nuxt UI's `UChart`. Tables use `UTable` with the `@tanstack/vue-table` version Nuxt UI pins (currently 8.x), so two table majors are never bundled.

### D8. Auth
- **Adapter interface:** `AuthAdapter` with `getUser(event)`, `signIn`, `signOut`, user CRUD, and an optional `oauthProviders`.
- **Built-in adapter:**
  - Nuxt 4.6 `nuxt/server` `useSession` (iron-sealed, HTTP-only cookie) with `runtimeConfig.appSecret` (`NUXT_APP_SECRET`). We don't depend on `nuxt-auth-utils`, because the platform now provides sessions; less code.
  - **Passwords:** `node:crypto` `scrypt` (N=2^17, r=8, p=1), with the parameters encoded in the hash for future upgrades. Runtimes without `scrypt` fall back to Web Crypto PBKDF2-SHA256 with 600k iterations (OWASP), using the same encoded-hash format.
  - **Revocation:** session ids are stored server-side so logout or reset can revoke them.
  - **Passkeys (optional):** `auth.passkeys` (off by default) enables WebAuthn sign-in through `@simplewebauthn/server` on the server and `@simplewebauthn/browser`, lazy-loaded on the admin login page only.
    - A passkey is an additional sign-in method. Users register one after a password login, and the password remains the recovery path.
    - The relying party ID is derived from the public site URL. User verification is required and the signature counter is checked.
    - Credentials live in a `user_passkeys` table. Adding and removing passkeys is audited, and the CLI reset-password also revokes sessions created by passkey sign-in.
    - Web Crypto only, so it works on edge runtimes.
    - When disabled, no passkey endpoints are registered and no passkey code ships to the admin.
- **Better Auth:** `@nuxt-atelier/auth-better-auth` follows the official Better Auth Nuxt integration guide: a catch-all handler at `/api/auth/**`, the `better-auth/vue` client, and `useSession(useFetch)` for SSR. It uses Better Auth's Drizzle adapter on the same database.
  - **Config:** in `server/atelier/auth.ts`.
  - **Tables:** Better Auth's tables, plugins included, come from its `getSchema()`. They're declared in `server/atelier/tables.ts`, core's extension point for extra tables, which migrations, D1 and the CLI handle like content tables.
  - **Roles:** the CMS role is a field on Better Auth's user (`additionalFields`, `input: false`), set at sign-up by `mapRole`. A user without one has no CMS access.
- **Custom adapters** call `registerAuthAdapter()` from a Nitro plugin.
- **Authorization:** a single `can(user, action, resource, entry?)` policy engine used by the API, admin and editor. Field-level and entry-level rules are compiled from role definitions.
- **Roles** are data in two places:
  - the `atelier_roles` table, edited in the admin by users with the `roles` capability (audited);
  - `server/atelier/roles.ts` in the app or a layer (`defineRoles`), for teams that keep roles in git. These are read-only in the admin and win on a name clash.
  - `admin` is built in and can't be defined or edited. First-run setup seeds an `editor` role when none exists.
  - The policy is rebuilt from both on each request, so a role edit applies at once on every instance.
- **CSRF:** `SameSite=Lax` cookies + `Origin`/`Sec-Fetch-Site` checks on unsafe methods + a double-submit token for the admin.

### D9. Lifecycle, jobs, webhooks, real-time signals
- **Revisions:** an append-only `revisions` table, one row per saved version, flagged `published` for the versions that were published. Diff is computed client-side from two JSON snapshots, using a block-aware differ keyed by block id.
- **Drafts and published content** (revised while implementing 10.1): the site has to filter, sort, populate relations and resolve URLs on published values, so a pointer to a published revision's JSON isn't enough. Each content table has a published copy with the same columns (`atelier_p_<collection>`, `atelier_p_singletons`, `atelier_p_relations`, `atelier_p_routes`). The store runs the same code on either copy. Publishing, in one transaction (one batch on D1), saves the draft as a new version marked `published` and copies its row and relation rows across. It also computes the published URLs; redirects and URL conflicts are decided there, so a draft's URL is never public. The published row's `_version` is the published revision. Types without `versioned` publish every save. Reads default to published; drafts need `?draft=true` and the `update` permission. Visitors read with a built-in `public` role (read everything by default, overridable, never writes).
- **Jobs:**
  - A database-backed queue with `run_at`, `attempts`, `max_attempts`, `locked_until` and exponential backoff. Workers claim jobs with an atomic `UPDATE … WHERE locked_until < now` (`SKIP LOCKED` on Postgres/MySQL 8).
  - **Running jobs:** the DB queue is the durable store (Nitro tasks have no persistence, retries or visibility). A single Nitro task, `atelier:jobs`, drains due jobs with bounded concurrency. The module enables `nitro.experimental.tasks` through the public `nitro:config` hook and registers the task in `scheduledTasks` (every minute by default).
    - Nitro runs scheduled tasks natively on `node`/`bun`/`deno` presets and generates Vercel Cron Jobs and Cloudflare Cron Triggers at build time.
    - On platforms without scheduled-task support (e.g. Netlify, generic serverless), an authenticated trigger endpoint calls `runTask('atelier:jobs')` for an external scheduler, as Nitro recommends.
    - `atelier jobs run` and `nuxi task run atelier:jobs` drain the queue manually.
    - Task registration uses `{nitro2, nitro3}` variants (the import path moves to `nitro/task` in Nitro v3).
  - **Recurring schedules:** code-defined schedules become `scheduledTasks` entries. `croner` 11 is used only to compute `run_at` for recurrences created at runtime.
- **Webhooks:** signed per the Standard Webhooks spec with Web Crypto HMAC-SHA256, so no extra dependency is needed. The SSRF guard resolves DNS and rejects private, loopback and link-local ranges unless allowlisted.
- **Locks and presence:** a database table with heartbeats every 20 s via `useIntervalFn`. The table is always the source of truth.
- **Real-time transport:** `atelier.realtime` defaults to `'auto'`. It enables `nitro.experimental.websocket` (via `nitro:config`) on presets that support it (node, bun, deno, cloudflare), and registers a `defineWebSocketHandler` route at `/api/_atelier/ws`.
  - Pushes lock, presence, comment and notification events as invalidation signals; clients refetch through the REST API.
  - `upgrade` authenticates with the session cookie and rejects a foreign `Origin` (cross-site WebSocket hijacking).
  - crossws pub/sub is per instance, so while connected the client also polls every 60 s to reconcile across instances.
  - Without WebSocket (unsupported preset, `realtime: false`, or connection failure), the client falls back to 20 s polling. Behaviour stays correct; only latency changes.
  - The visual editor bridge stays on postMessage; it is not affected.
- **Dates:** every date calculation (scheduling, retention, expiry, display) uses `date-fns` 4 + `@date-fns/tz` (`TZDate`). Times are stored in UTC and shown in the user's time zone.

### D10. Rich text
- **Editor and storage:** Tiptap 3 in the admin and for inline editing in the bridge, stored as **ProseMirror JSON**, never raw HTML.
- **Public rendering:** server-side through `@tiptap/static-renderer` into Vue VNodes, with an allowlisted node and mark schema. Hosts can map nodes to their own components, for example links to `NuxtLink`.
- **Why:** XSS-safe by construction, links resolved by entry id at render time, no HTML sanitiser on the hot path.
- **Pasted or imported HTML** is parsed through the same schema, which drops unknown nodes and attributes.

### D11. Media
- **Driver interface:** `put`, `getStream`, `delete`, `head`, `signedUrl?`, all streaming via Web Streams.
- **Built-in drivers:**
  - **Local filesystem:** default `.data/uploads`, served by a handler with immutable cache headers. No symlinks into `public/` (Pruvious #121, #125, #138).
  - **S3-compatible and R2:** `aws4fetch` signing. It is tiny and fetch-native, so it works on edge runtimes. `@aws-sdk/client-s3` was rejected for bundle weight.
  - **Vercel Blob:** `@vercel/blob`.
- **Content-type sniffing:** `file-type` 22.
- **Images:** variants via `ipx` 4 + `sharp` 0.35, loaded only when available.
  - On Workers or edge, configure a `@nuxt/image` provider (Cloudflare Images, Vercel, and others); the render component delegates to `<NuxtImg>` when `@nuxt/image` is installed.
  - Focal point is stored as relative x/y and applied to crops.

### D12. Localization
- **CMS side:** owns content localization. Each entry has a `locale` column and a `translationGroupId`. The shared versus translated distinction is per field, and there's a fallback chain at read time.
- **i18n adapter:** `I18nAdapter` covers `locales()`, `currentLocale(event)`, `localePath(path, locale)` and `routeStrategy`. It is auto-detected:
  1. `nuxt-i18n-micro` if installed (default)
  2. otherwise `@nuxtjs/i18n`
  3. otherwise a no-op single-locale adapter
- **Admin interface strings:** shipped as JSON message catalogs loaded lazily, independent of the site's i18n module, so the admin works with neither installed.

### D13. Routing, SEO, search, forms, multi-site
- **Routing:** a single catch-all page added via `extendPages` at the lowest priority (`/:path(.*)*`) resolves through the `routes` table. Host pages win because the router ranks them higher. Redirects are evaluated in a server middleware before rendering, served from a cached map.
- **SEO:** head output through Nuxt's `useHead`/`useSeoMeta` (public API). Sitemap and robots integrate with `@nuxtjs/sitemap` and `@nuxtjs/robots` when installed, standalone or through Nuxt SEO v6 (`@nuxtjs/seo`), through their documented source hooks and APIs. Otherwise minimal built-in endpoints are used.
- **Search:** a `search_documents` table maintained on publish. Each engine uses its native full-text search: SQLite FTS5, Postgres `tsvector` + GIN, MySQL `FULLTEXT`. User input is always bound as parameters and tokenised into plain terms. A `SearchAdapter` allows external engines.
- **Forms:** form definitions are a built-in collection. The form block renders with TanStack Form and a Valibot schema generated from the definition, and the server re-validates. Submissions and files go to private storage. Spam protection uses a honeypot, minimum fill time and rate limits. Email goes through a minimal `MailAdapter`: an SMTP adapter via `nodemailer` (Node only, optional) and HTTP-provider adapters.
- **Multi-site:**
  - A `site_id` column on site-scoped tables.
  - The site is resolved from the `Host` header in a server middleware into `event.context.atelier.site`.
  - Every data-access function requires a site context argument, with no default, so a missing scope is a type error. This enforces isolation in the data layer.
  - An isolation test matrix runs against all endpoints.

### D14. AI assist
- **Packaging:** `@nuxt-atelier/ai` defines the `AiAdapter` and ships a provider-agnostic implementation on the AI SDK (`ai` 7.x). Users pick any AI SDK provider package.
- **Execution:** server-side only. Admin UI actions are lazy-loaded only when the adapter is configured. Results are always shown as suggestions.

### D15. Performance and safety mechanics
- **Bundle budget:** `size-limit` 14 in CI against the `test/fixtures/plain-css` public page.
- **Server benchmark:** a benchmark script (autocannon-style, run with Bun) against the fixture, with the baseline stored in the repo.
- **N+1 guard:** the query counter in tests wraps the Drizzle logger.
- **Limits:** all defined in one `limits` config object with safe defaults and validated at boot.
- **Security headers:** applied on admin and API routes through Nitro route rules and `nuxt/server` handlers. The admin CSP gets nonces where Nuxt provides them.
- **Dependency checks:** `knip` (unused dependencies), `publint` and `@arethetypeswrong/cli` (packaging correctness), and `bun audit` (vulnerabilities) in CI.
- **Operations:**
  - **Logging:** structured JSON logs through a tiny logger: levels, redaction list, correlation id from `x-request-id` or generated.
  - **Health:** `/api/_atelier/health/live` and `/ready`.
  - **Shutdown:** handled in a Nitro `close` hook, through the plugin variant per runtime.

### D16. Shared utilities and conventions
- **Utilities:** VueUse 15 (`@vueuse/core`, `@vueuse/nuxt`) for all composable utilities: event listeners, observers, storage, clipboard, intervals, debounce/throttle, keyboard shortcuts via `useMagicKeys`. We write no bespoke equivalents.
- **Dates:** `date-fns` + `@date-fns/tz` only. Never `Date` arithmetic by hand, never another date library.
- **Small helpers:** `defu`, `ufo`, `pathe` and `ohash` (unjs, already Nuxt dependencies, so they add no weight).
- **Code style:** ESLint 10 with `@nuxt/eslint-config`, plus `oxlint` for speed. TypeScript **6.0.3** with `vue-tsc` 3.3. A non-blocking CI job tries TS 7 and Vue language tools v4, so we switch when they are stable.
- **Dependency versions:** the D19 baseline lives once in the root `package.json` as Bun workspace catalogs (`catalog` plus named `catalogs`: build, ui, db, editor, media, adapters, docs, test, quality). Workspace packages reference them with `catalog:` / `catalog:<name>`. Peer ranges (`nuxt >=4.6`) stay literal. A catalog entry is added by the task that first uses the dependency, at its D19 version, so `knip` can flag unused entries from day one; D19 remains the reference baseline.
  - Runtime dependencies of published packages use caret ranges at the D19 floor (e.g. `@nuxt/kit ^4.6.3`), so users don't get duplicate installs. Tooling, test and docs entries are exact. `drizzle-orm`/`drizzle-kit` stay exact (D5). `bun.lock` pins everything for the repo itself.
- **Git:** semantic commits (`feat:`, `fix:`, `docs:`, `perf:`, `refactor:`, `test:`, `chore:`, `ci:`) and semantic branch names (`feat/block-system`). Changesets drive versioning and changelogs.

### D17. Testing and CI matrix
- **Unit and integration:** Vitest 5 with `@nuxt/test-utils` 4 and happy-dom. **End-to-end:** Playwright 1.64 plus `@axe-core/playwright` for accessibility.
- **Matrix:**
  - Nuxt `latest` 4.x
  - Nuxt 4.x with `future.compatibilityVersion: 5`
  - `nuxt-nightly@5x`, required to pass before the Nuxt 5 GA support claim
  - Databases: SQLite, Postgres, MySQL, MariaDB (service containers)
  - Runtimes: Node 22/24/26, Bun, Deno
- **Deploy smoke tests:** Docker, plus Vercel and Netlify preview builds. Cloudflare Workers gets a build-and-run smoke test with documented limitations.
- **Fixtures** prove UI agnosticism: Nuxt UI site, shadcn-vue site (`shadcn-nuxt` 2.9), plain CSS, Tailwind-only, a layer-override app, multi-site and i18n.

### D18. Documentation
- **Site:** `docs/` is a Docus 5.15 app (Content v3 + Nuxt UI v4 included) that installs the workspace packages. Live demos use MDC components in `components/content/` that mount the real editor against a demo adapter: an in-memory, per-session content adapter that resets, so no arbitrary content persists. Docus 5.15.0 still depends on the previous Nuxt SEO generation, so the root `package.json` `overrides` force the v6 modules (`nuxt-og-image` 7, `@nuxtjs/sitemap` 9, `@nuxtjs/robots` 7, `nuxt-schema-org` 7, `nuxt-site-config` 5); verified to build, prerender OG images and serve sitemap/robots. Drop the overrides once Docus depends on v6. The docs app also lists `@takumi-rs/core` (the OG image renderer) directly, because Bun's isolated linker does not expose Docus's copy to `nuxt-og-image`, which resolves it from the app directory.
- **Deployment:** an SSR target, because the demos need server routes. It is hosted on the maintainer's Dokploy instance at **`https://nuxt-atelier.anorebel.net`**, following the existing TDC Docs setup:
  - a Dokploy project "Nuxt Atelier" with an application "Nuxt Atelier Docs"
  - GitHub source through the existing Dokploy GitHub App
  - Dockerfile build (`docs/Dockerfile`, context `.`, multi-stage Bun install then Node runtime `node .output/server/index.mjs` on port 3000)
  - auto-deploy on push, filtered by watch paths (`docs/**`, `packages/**`, `package.json`, `bun.lock`)
  - HTTPS domain on port 3000
  - The demo adapter is in-memory per session, so no volume is needed.
- **Reference generation:** the config reference is generated from the module's option schema, and the CI completeness check compares the two. The API reference is generated from TSDoc.
- **Repository files:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and PR templates.
- **Wording:** product-focused only.

### D20. Optional DevTools integration
- **Package:** `@nuxt-atelier/devtools`, installed as a dev dependency. Core has no DevTools code or dependency, the pattern Nuxt SEO uses (its DevTools host is a separate package).
- **API:** `@nuxt/devtools-kit` 4.x. DevTools 4 (on Vite DevTools) registers docks with `onDevtoolsReady(ctx => ctx.docks.register(...))` and RPC with `ctx.rpc.register(defineRpcFunction(...))`. Nuxt 4.6 still ships DevTools 3 (`nuxt` depends on `@nuxt/devtools ^3.4`), where `devtools:ready` never fires, so the integration falls back to `addCustomTab` / `extendServerRpc` (deprecated shims in v4, removed in v5).
- **Guard:** registers only when `nuxt.options.dev` is true and `nuxt.options.devtools` isn't disabled (`false` or `{ enabled: false }`).
- **Panels:** iframe docks served by the dev server: Schema (collections, singletons, fields, table and column names), Migrations (status from `migrationStatus`, pending list, the `--drop` / `--rename` flags a blocked change needs, an apply action), Jobs (queue and retry, from section 11), and the admin (`/admin` in an iframe).
- **Security:** RPC names, dock ids and commands use the `atelier:` prefix. Actions that change data run only over DevTools' authorized connection, never when `devtools.disableAuthorization` is set, because that lets any browser that reaches the dev server call them.

### D19. Pinned dependency baseline (verified on npm, 2026-10-31)

| Area | Package | Version |
|---|---|---|
| Framework | nuxt / @nuxt/kit / @nuxt/schema | 4.6.3 (peer `>=4.6`) |
| | vue / @vue/compiler-sfc | 3.5.44 |
| | vue-router | 5.4.0 (via Nuxt) |
| Build | @nuxt/module-builder | 1.0.3 |
| | typescript / vue-tsc | 6.0.3 / 3.3.14 |
| | oxc-parser / magic-string | 0.156.0 / 1.4.5 |
| UI (admin) | @nuxt/ui | 4.12.0 |
| | tailwindcss | 4.3.3 |
| | reka-ui | 2.11.0 (via Nuxt UI) |
| Data | drizzle-orm / drizzle-kit | 1.0.0-rc.5 (exact pin) |
| | @libsql/client / pg / mysql2 | 0.18.0 / 8.23.1 / 3.24.6 |
| Validation, forms | valibot | 1.5.0 |
| | @standard-schema/spec | 1.1.0 |
| | @tanstack/vue-form | 1.33.5 |
| State, charts | @tanstack/vue-query | 5.105.0 |
| | @tanstack/vue-charts | 1.1.0 |
| Utilities | @vueuse/core / @vueuse/nuxt | 15.0.0 |
| | date-fns / @date-fns/tz | 4.4.0 / 1.5.0 |
| | croner | 11.0.0 |
| | defu / ufo / pathe / ohash | via Nuxt |
| Editor | @tiptap/core, vue-3, pm, starter-kit, static-renderer | 3.32.2 |
| | @atlaskit/pragmatic-drag-and-drop | 4.0.0 |
| Media | file-type | 22.3.0 |
| | ipx / sharp | 4.1.0 / 0.35.5 (optional) |
| | aws4fetch | 1.0.20 (S3/R2 adapter) |
| | @vercel/blob | 2.8.2 (adapter) |
| | @nuxt/image | 2.2.1 (optional integration) |
| Auth | better-auth | 1.7.14 (adapter package) |
| | @simplewebauthn/server / @simplewebauthn/browser | 14.0.3 / 14.0.0 (optional passkeys) |
| i18n | nuxt-i18n-micro | 3.30.3 (default adapter) |
| | @nuxtjs/i18n | 10.6.0 (adapter) |
| SEO | @nuxtjs/sitemap / @nuxtjs/robots | 9.1.0 / 7.0.2 (optional; the versions Nuxt SEO v6, `@nuxtjs/seo` 6.0.1, bundles) |
| AI | ai | 7.0.159 (adapter package) |
| Mail | nodemailer | 10.3.1 (optional SMTP adapter) |
| DevTools | @nuxt/devtools-kit | 4.1.0 (integration package only) |
| Docs | docus | 5.15.0 |
| Test | vitest / @vitest/coverage-v8 | 5.0.5 |
| | @nuxt/test-utils | 4.3.4 |
| | @playwright/test | 1.64.1 |
| | @axe-core/playwright | 4.14.0 |
| | happy-dom | 21.0.4 |
| | @vue/test-utils | 2.5.1 |
| Quality | eslint / @nuxt/eslint-config | 10.14.0 / 1.17.0 |
| | oxlint | 1.90.0 |
| | knip | 6.44.0 |
| | publint | 0.3.25 |
| | @arethetypeswrong/cli | 0.18.5 |
| | size-limit | 14.3.0 |
| | @changesets/cli | 3.0.3 |
| Tooling | bun | 1.4.4 |

**Upgrade policy:** Dependabot (`bun` and `github-actions` ecosystems, root directory) opens grouped PRs weekly; its Bun updater edits catalog entries since dependabot-core v0.401.0. Renovate is not used because it does not extract Bun catalogs yet. Patch and minor updates merge on a green CI. Majors get a dedicated PR with a migration note.

## Risks / Trade-offs

- **[Drizzle 1.0 is an RC]** → Pinned to an exact version and wrapped behind our storage layer, so API churn stays in one package. Re-pin on each RC and move to stable once released.
- **[Nuxt 5 not GA, Nitro v3 still RC]** → `nuxt/server` plus `{nitro2, nitro3}` variants. A nightly-5x CI job is required. Release notes state the tested Nuxt 5 build.
- **[vue-tsc 3.3.13+ regression]** → The maintainer's TDC project pinned vue-tsc 3.3.11 after 3.3.13 lost track of slot props and `v-for` variables in nested scoped slots. Verify 3.3.14 against the admin's nested slots before adopting it; otherwise pin 3.3.11 exactly. **Verified (task 1.6):** `test/vue-tsc/NestedSlots.vue` fails on 3.3.13 (#6237) and passes on 3.3.14, so 3.3.14 is pinned.
- **[nuxt-i18n-micro depends on h3 v1, single maintainer]** → Observed in the maintainer's TDC project: under `compatibilityVersion: 5` on Nuxt 4.6, its server code imports `useRuntimeConfig` from `#imports` and fails to build. The adapter package therefore tests this mode explicitly. It sits behind the adapter. `@nuxtjs/i18n` is a first-class alternative. Its Nuxt 5 status is tracked, and the default switches if it isn't Nuxt-5-ready when Nuxt 5 ships; the docs say so.
- **[Shadow DOM admin: third-party admin plugins that portal to `document.body` escape isolation]** → Expose the shadow portal target through a composable and document it. A dev-mode warning fires when an admin overlay mounts outside the root.
- **[The host's `app.vue` chrome (header/footer) still mounts on admin routes]** → The admin is a fixed full-viewport teleport with body scroll locked, so it is visually unaffected. The docs show the optional `route.meta.atelierAdmin` check for hosts that want to skip their own chrome there.
- **[Host route middleware or plugins run on admin routes]** → Documented. The admin route sets a `meta.atelier = 'admin'` marker that host middleware can check.
- **[Cloudflare Workers / D1: no transactions, no sharp, no native scrypt guarantee]** → The D1 driver is behind a capability flag; operations needing transactions use D1 `batch()` where it is equivalent, or fail clearly. Images go through an external provider. Passwords fall back to PBKDF2. The limitations get their own docs page.
- **[TypeScript 7 transition]** → Stay on 6.0.3. A non-blocking TS 7 job gives early warning.
- **[Nuxt UI pins `@tanstack/vue-table` 8.x while 9.x is latest]** → Use Nuxt UI's `UTable` only and never import 9.x directly. Revisit when Nuxt UI upgrades.
- **[Scope is very large for a production-ready v1]** → Tasks are ordered so the core (module, schema, storage, API, auth, blocks, renderer, editor, admin) is releasable first behind stable contracts. Extras build on those contracts and are released under the same v1 only when they meet their specs.
- **[Static macro extraction limits expressiveness]** → The schema-file style is the escape hatch for dynamic or third-party cases, with clear diagnostics.
- **[Polling-based presence and locks add load]** → WebSocket push is used where the platform supports it, which reduces polling to a 60 s reconciliation. Where it isn't, intervals are configurable (default 20 s) with cheap indexed upserts.
- **[Nitro tasks and WebSocket are experimental]** → Both sit behind our own job runner and realtime interfaces with `{nitro2, nitro3}` variants. The trigger endpoint and polling are permanent fallbacks, so an upstream change degrades latency, not correctness. CI covers both paths.
- **[`catalog:` only resolves through Bun's publish path]** → Packages are published with `bun publish` (which rewrites `catalog:` to real ranges). Changesets is used for versioning and changelogs only, never `changeset publish`. A pack check in CI fails if a tarball still contains `catalog:`.
- **[`aws4fetch` hasn't been released since 2024]** → It is small, stable and spec-driven (SigV4), and isolated in the S3 adapter package, so it can be swapped without affecting users.

## Migration Plan

This is greenfield, so there is no data to migrate. The release plan:

1. `0.x` pre-releases on npm (`next` tag) once the core milestone passes CI on the full matrix.
2. Public beta with the docs site and live demos. The adapter contract is frozen at `v1` for the beta.
3. `1.0.0` once every spec scenario has an automated test passing on the full matrix, including the Nuxt 5 nightly or GA, and the performance budgets hold.
4. Rollback for users: migrations are reversible where drizzle-kit permits, and `atelier export` before upgrades is documented as best practice. Each release notes any irreversible migration.

## Resolved Decisions (from review)

- **Benchmarks** run on GitHub-hosted `ubuntu-latest` runners and compare against a rolling baseline (median of the last 5 main-branch runs) to absorb noise.
- **Form challenge:** a `ChallengeAdapter` interface with **Cloudflare Turnstile** as the only built-in provider. Users can plug in any other provider.
- **Docs hosting:** Dokploy at `nuxt-atelier.anorebel.net` (see D18).

## Open Questions

- The GitHub repository name/owner (the local directory is `nuxt-cms`, the product is `nuxt-atelier`) and the branch Dokploy deploys from are confirmed with the maintainer when the remote is created. The deploy task is otherwise identical.
