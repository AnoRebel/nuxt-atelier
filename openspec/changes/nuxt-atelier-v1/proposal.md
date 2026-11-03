# Proposal

## Why

Nuxt has no production-grade, future-proof CMS with a visual builder that renders the site's *own* Nuxt components. The two closest projects both fall short for production use:

- **blökkli** is an editor only. Its only real backend is Drupal, v2 has been in alpha for 18 months, and v1 breaks on Nuxt ≥3.17 (#52).
- **Pruvious** ships a full backend, but v3 is frozen and the v4 rewrite has been stalled in alpha since June 2026. It broke for over a year on Nuxt 3.16 (#112, #147). It also suffers from admin/site CSS clashes (#11, #148, #153) and block-data corruption bugs (#150–#154).

Both projects depend on Nuxt/Vite internals and have a bus factor of one. Nuxt 4.6 now offers a defined public `@nuxt/kit` surface and a portable `nuxt/server` API, and Nuxt 5 (Nitro v3/h3 v2) is due in Q4 2026. That makes now the right time to build a CMS that combines the strengths of both projects and runs only on public APIs.

## What Changes

New greenfield project **Nuxt Atelier** (`nuxt-atelier`). It is a Bun monorepo, MIT licensed, and delivers:

- **Module and optional layer.** A Nuxt module (`modules: ['nuxt-atelier']`) with typed options and sane defaults, plus an optional starter layer for overridable admin pages and theme files. It never takes over `app.vue`.
- **Code-first content schema.** Collections, singletons and fields defined in code drive the database, API, validation, generated types and admin forms.
- **Block system.** Blocks are defined either with an in-SFC `defineBlock()` macro and field helpers in `defineProps`, or with a separate schema file. Schemas are extracted statically at build time (no `eval`), blocks can be overridden from Nuxt layers, and stored data is reconciled when schemas change.
- **Visual editor.** The real site routes run in an iframe inside the admin, connected by a typed postMessage bridge. It supports selection, drag and drop, inline editing, undo/redo, responsive preview and proxy mode for complex blocks. Editor code is never shipped to public visitors.
- **Pluggable storage.** A built-in Drizzle backend (SQLite/libSQL, PostgreSQL, MySQL/MariaDB) with explicit, reviewable migrations, plus a public **content adapter contract** so other backends can drive the same editor. Edge databases (D1) are prepared and implemented only where compatible.
- **Typed REST API, server hooks, job queue and outgoing webhooks.** Jobs use the platform's native scheduler where Nitro supports it, and editors get real-time updates over WebSocket where the platform allows, with polling as the fallback.
- **Auth adapter.** A built-in users/roles/sessions implementation by default, with optional passkey sign-in, a first-class Better Auth adapter, and granular role-based permissions.
- **Content lifecycle.** Drafts, revisions with diff and restore, scheduled publishing, comments and edit locking.
- **Localization.** Content is localized in the CMS. Routing and UI-string i18n go through an adapter: nuxt-i18n-micro by default, @nuxtjs/i18n first-class, or no i18n module at all.
- **Media library.** Uploads, folders, focal points and image variants, stored through pluggable drivers (local, S3, R2, Vercel Blob).
- **Routing, SEO, sitemap and redirects** for routable collections.
- **Reusable blocks, templates and patterns.**
- **Headless admin.** Admin composables with a default Nuxt UI v4 kit that is fully themeable and overridable. It is mounted in the same app at a configurable route with strict CSS isolation, and is optional: the core runs without it.
- **UI-library agnostic site blocks.** Blocks can use Nuxt UI, shadcn-vue, Tailwind or plain CSS with no CMS coupling.
- **Forms.** A form builder with stored submissions, spam protection, and notifications.
- **Full-text search.** Search across published content and global search in the admin.
- **Multi-site / multi-tenant.** Several sites or domains served from one instance.
- **Pluggable AI assist.** Off by default and provider-agnostic.
- **Performance, safety and operations.** Measured performance budgets, bounded resource usage, secure defaults, health checks, structured logs, and graceful shutdown.
- **Docus documentation and demo site** that consumes the module for live demos, with complete user, developer, and contributor documentation.
- **Compatibility.** Supports Nuxt ≥4.6 and is Nuxt 5 ready. CI runs against Nuxt 4 latest, `compatibilityVersion: 5` and the Nuxt 5 nightly.

## Capabilities

### New Capabilities
- `module-integration`: Nuxt module/layer packaging, configuration, the Nuxt version-compatibility contract, the public-API-only rule, and an optional Nuxt DevTools integration.
- `content-schema`: Collections, singletons, field types, validation, and generated types.
- `block-system`: Block definition (macro and schema file), discovery, layer overrides, nesting rules, rendering, and data reconciliation.
- `visual-editor`: The iframe preview bridge and the visual editing interactions.
- `content-storage`: The built-in database backend, migrations, and the public content adapter contract.
- `content-api`: The REST API, querying, and the typed client.
- `access-control`: The auth adapter, users, roles, and permissions.
- `content-lifecycle`: Drafts, publishing, revisions, and scheduling.
- `editorial-collaboration`: Comments and edit locking.
- `localization`: Localized content and the i18n module adapter.
- `media-library`: Uploads, storage drivers, and image processing.
- `site-routing`: Routable content, URL resolution, and redirects.
- `seo-metadata`: Per-entry SEO metadata, sitemap, and robots.
- `reusable-content`: Shared blocks, templates, and patterns.
- `extensibility`: Hooks, jobs, webhooks, and plugins.
- `admin-dashboard`: Headless admin, the default Nuxt UI kit, theming, overrides, custom pages, and CSS isolation.
- `forms`: Form definition, submissions, spam protection, and notifications.
- `content-search`: Full-text search for site visitors and admin users.
- `multi-site`: Multiple sites or tenants served from one instance.
- `ai-assist`: Optional, provider-agnostic AI assistance in the admin.
- `runtime-performance`: Performance budgets, resource limits, secure defaults, and operational health.
- `documentation-site`: The Docus-based docs and live demo site, plus user, developer, and contributor documentation, including per-platform hosting guides with working examples.

### Modified Capabilities
_None. This is a greenfield project with no existing specs._

## Impact

- **Code.** New repository layout:
  - `packages/core` → `nuxt-atelier`: the module, schema, server, and renderer.
  - `packages/admin` → `@nuxt-atelier/admin`: the headless admin and the Nuxt UI kit.
  - `packages/editor` → `@nuxt-atelier/editor`: the visual editor and bridge.
  - `@nuxt-atelier/*` adapter packages for auth, i18n, and storage, plus `@nuxt-atelier/layer`.
  - `playground/`: development app.
  - `docs/`: the Docus site.
- **Dependencies.** Latest maintained versions, verified on npm on 2026-10-31. The full pinned list is in design.md.
  - Peers: `nuxt >=4.6`.
  - Core: `@nuxt/kit ^4.6`, `drizzle-orm` 1.0 RC (pinned), `valibot ^1.5`, Tiptap 3, `@vue/compiler-sfc`.
  - Optional: `@nuxt/ui ^4.12`, `tailwindcss ^4.3`, `better-auth ^1.7`, `nuxt-i18n-micro ^3.30`, `@nuxtjs/i18n ^10.6`, `@nuxtjs/sitemap ^9.1`.
  - Tooling: TypeScript 6.0.3.
- **Runtime targets.**
  - Tested in CI: Node, Docker, Bun, Deno, Vercel, and Netlify.
  - Cloudflare Workers: supported, with documented limitations.
- **Risks tracked.**
  - nuxt-i18n-micro's Nuxt 5 readiness (it still depends on h3 v1).
  - The Drizzle 1.0 migration (currently a release candidate).
  - Nuxt 5 GA timing.
  - The cost of maintaining an all-optional admin package.
