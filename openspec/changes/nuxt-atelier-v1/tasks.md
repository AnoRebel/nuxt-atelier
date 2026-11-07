# Tasks

## 1. Repository foundation

- [x] 1.1 Initialise the Bun workspace (`package.json` workspaces: `packages/*`, `playground`, `docs`, `test/fixtures/*`), `bunfig.toml`, `.editorconfig`, `.gitignore` (`.data/`, `.output/`, `.nuxt/`), MIT `LICENSE`; verify `bun install` succeeds on a clean clone
- [x] 1.2 Add shared TypeScript 6.0.3 config, ESLint 10 + `@nuxt/eslint-config`, oxlint, and lint-staged with a commit-msg check enforcing semantic commit types; verify `bun run lint` passes and a non-semantic commit message is rejected
- [x] 1.3 Add a lint rule/script forbidding internal Nuxt/Nitro/Vite imports (`#build/*`, `nuxt/dist/*`, `nitropack/runtime/internal/*`), private `nuxt.options._*` access, and writes outside `buildDir`; verify it fails on a deliberately bad fixture file and passes on the repo
- [x] 1.4 Scaffold packages `packages/core` (`nuxt-atelier`), `admin`, `editor`, `layer`, and adapter package folders with `@nuxt/module-builder` 1.0.3 builds emitting `.mjs` + `.d.mts`; verify `bun run build` produces dist for each and `publint` + `@arethetypeswrong/cli` pass
- [x] 1.5 Pin the dependency baseline from design D19 in root Bun workspace catalogs (`catalog:` / `catalog:<name>` references in packages; exact pin for `drizzle-orm`/`drizzle-kit` 1.0 RC) and add Dependabot config with grouping; verify `bun pm ls` shows the pinned versions and `knip` reports no unused dependencies
- [x] 1.6 Verify vue-tsc 3.3.14 against a nested-scoped-slot + `v-for` test component; pin 3.3.14 if it type-checks correctly, otherwise pin 3.3.11, and record the result in the contributing guide's toolchain notes
- [ ] 1.7 Create the CI workflow skeleton (lint, typecheck, unit, build) on GitHub Actions with Bun 1.4.4 and Node 22/24/26; verify a pushed branch runs all jobs green
- [x] 1.8 Add `CONTRIBUTING.md` (setup, workspace layout, scripts, semantic commits/branches, changesets), `CODE_OF_CONDUCT.md`, `SECURITY.md` (private disclosure), issue/PR templates, and configure Changesets; verify a new contributor can follow `CONTRIBUTING.md` on a clean machine to run lint, build, and tests

## 2. Documentation site and playground scaffolding

- [x] 2.1 Create `docs/` as a Docus 5.15 app (`extends: ['docus']`) with branding for Nuxt Atelier, sections (Getting Started, Guides for editors, Developer reference, Deployment, Contributing), and workspace dependency on `nuxt-atelier`; verify `bun run docs:build` succeeds
- [x] 2.2 Create `playground/` Nuxt 4.6 app consuming workspace packages with env-switchable database URL; verify `bun run dev` starts the playground
- [x] 2.3 Add a docs CI job that builds the docs against workspace packages and fails on broken links or MDC component errors; verify it fails when a referenced component is removed
- [x] 2.4 Add `docs/Dockerfile` (multi-stage: Bun install/build, Node 26 runtime serving `.output/server/index.mjs` on port 3000, non-root user, healthcheck); verify `docker build -f docs/Dockerfile .` and `docker run` serve the docs locally on port 3000

## 3. Module core and configuration (module-integration)

- [x] 3.1 Implement `defineNuxtModule` for `nuxt-atelier` with `configKey: 'atelier'`, `meta.compatibility` (`nuxt: '>=4.6.0'`, `server: 'nuxt'`), and defaults (SQLite `.data/atelier.sqlite`, local storage, built-in auth, admin base `/admin`); verify a fixture with only `modules: ['nuxt-atelier']` boots, and a Nuxt 4.5 fixture fails with a compatibility error
- [x] 3.2 Implement Valibot schema for module options with actionable error messages at build start; verify unit tests for invalid DB URL scheme, invalid admin base, and invalid limits produce messages naming option, value, and accepted values
- [x] 3.3 Map secrets/env settings to `runtimeConfig` (`NUXT_ATELIER_DATABASE_URL`, storage creds, `NUXT_APP_SECRET`, public site URL); verify a built fixture connects to a different DB when started with a changed env var without rebuild
- [x] 3.4 Register aliases `#atelier` and `#atelier/server`, `Atelier`-prefixed components dir, `useAtelier*` imports, and type templates; verify `nuxi typecheck` in a fixture resolves them
- [x] 3.5 Implement `@nuxt-atelier/layer` with overridable admin page and theme files and emitted `.mjs` `nuxt.config`; verify a fixture overriding a layer file uses the host version and a fixture without the layer works (the theme ships now as an overridable `AtelierTheme` component scoping the `--at-*` tokens; the layer's admin page file is added in 15.2, once the admin exists)
- [x] 3.6 Verify non-invasive integration with an e2e fixture that has its own `app.vue`, layouts, and pages: host pages render unchanged and the module adds no `app.vue` or root id requirement
- [x] 3.7 Write docs: installation, zero-config quick start, configuration overview, layer usage, compatibility policy; add the generated configuration reference (task 3.8) to the docs
- [x] 3.8 Generate the configuration reference from the options schema and add a CI check that fails when an option is undocumented; verify removing a doc entry fails CI

## 4. Content schema (content-schema)

- [x] 4.1 Implement `defineCollection`/`defineSingleton` discovered from `server/atelier/{collections,singletons}` in app and all layers via `getLayerDirectories()`; verify a layer-defined collection is registered in a fixture
- [x] 4.2 Implement field helpers for all built-in types (text, textarea, richText, number, boolean, select, multiSelect, date/time, email, url, slug, color, json, media, relation one/many, object, repeater, blocks) producing serialisable descriptors + Valibot schemas; verify unit tests per field covering valid/invalid values
- [x] 4.3 Implement declarative validation (required, min/max, length, pattern, unique, custom Standard Schema validator) and structured field-path errors; verify nested repeater/object error paths in unit tests
- [x] 4.4 Implement default factories so object/array defaults are fresh per entry/block; verify the shared-reference regression test
- [x] 4.5 Implement relation semantics (populate depth, on-delete restrict/nullify/cascade) and stable field keys with explicit rename declarations; verify tests for restrict refusal and rename preserving data (done after section 5: its verification needs the storage layer. `renamedFrom` on top-level fields and collections; migrations also move relation rows and history, and singleton data is read from the old key until saved)
- [x] 4.6 Implement custom field type registration (model, validators, admin input component reference); verify a `geo-point` fixture field validates and stores (done after section 5: its verification needs the storage layer. `defineFieldType` returns a helper whose descriptor carries its storage, Standard Schema and input component name: no global registry; the admin rendering the input is verified with the admin forms)
- [x] 4.7 Generate types for collections/singletons/fields for app and server code with HMR refresh on schema change; verify a type test fails on an unknown field and passes after adding it during dev
- [x] 4.8 Write docs: schema concepts, every field type with options and examples, validation, relations, custom fields

## 5. Storage engine and migrations (content-storage)

- [x] 5.1 Implement driver layer for `@libsql/client` (SQLite/libSQL/Turso), `pg`, and `mysql2` with Drizzle 1.0 RC, selected by URL scheme; verify connection tests per engine in CI service containers (verified locally against the same images as the CI services, `test/compose.yml`; the CI run itself waits on 1.7)
- [x] 5.2 Generate Drizzle table definitions from schema descriptors (entries, revisions with JSON block trees, relations, routes, and system tables); verify identical schema behaviour tests pass on SQLite, Postgres, MySQL, MariaDB Also add unique indexes for `unique` fields and supply the DB-backed `isUnique` check that `validateEntry` calls (from 4.3). (tables are pushed with drizzle-kit in the tests until 5.3 adds migrations)
- [x] 5.3 Implement `atelier migrate generate|apply|status` wrapping drizzle-kit, writing to `server/atelier/migrations/`, with a guard rejecting unannotated drops/renames; verify removing a field produces no drop until annotated (drops and renames are confirmed with `--drop` / `--rename`, written as `-- atelier:confirm` lines that `apply` also checks; drizzle-kit is an optional peer, only `generate` needs it)
- [x] 5.4 Implement dev auto-apply of non-destructive changes and production pending-migration detection that refuses writes with a clear error; verify both behaviours in fixture tests (dev generates and applies a migration per schema change, under a cross-process lock; a drop or rename is logged with the `--drop`/`--rename` command instead of applied; production bundles the migrations, logs pending ones and answers CMS writes with 503 via `assertMigrated()`, or applies them with `migrations.autoApply`)
- [x] 5.5 Implement atomic saves (entry + blocks + relations + revision) in transactions and optimistic concurrency via `version`; verify failure-injection test leaves no partial data and stale save returns 409 with current version (blocks are a JSON column on the entry row, so they save in the same transaction; HTTP endpoints convert the save errors with `toHttpError`)
- [x] 5.6 Implement D1 driver behind a capability flag using `batch()` where equivalent and explicit errors otherwise; verify a Workers smoke test and unsupported-operation error test (opt in with a `d1:<binding>` URL; saves run as one batch whose revision insert is the version check; bundled migrations auto-apply as one batch; `withTransaction` throws UnsupportedOperationError on D1; builds include only installed drivers, and a `d1:` build only D1; smoke test runs the built Worker in Miniflare)
- [x] 5.7 Define and publish the versioned content adapter contract (`nuxt-atelier/adapter`) with required/optional operations and a capability map; implement the built-in database adapter against it; verify a contract test suite runs against the built-in adapter (contract 1: required loadEditState, getFieldConfig, listBlockTypes, add/move/update/deleteBlock, save, permissions; optional revisions; `defineContentAdapter` checks the version and required operations and derives `capabilities`; `blockOperations` helpers for adapter authors; the suite lives in `test/adapter/contract.ts`)
- [x] 5.8 Implement a minimal in-memory reference adapter (used by docs demos and tests) implementing only required operations; verify the contract suite's required tests pass and optional features are reported disabled (`createMemoryAdapter` from `nuxt-atelier/adapter`; one instance per demo session keeps sessions apart; no validation)
- [x] 5.9 Implement streaming `atelier export`/`import` (content, revisions, relations, media metadata, settings) portable across engines; verify SQLite → Postgres round-trip equality test (NDJSON archive, gzipped for `.gz`; import into an empty migrated database in one transaction; verified SQLite → Postgres, MySQL and MariaDB; media metadata joins when section 12 adds its table)
- [x] 5.10 Write docs: database setup per engine, migrations workflow, D1 limitations page, adapter contract guide with a worked external-backend example, backup/export

## 6. Access control (access-control)

- [x] 6.1 Define the `AuthAdapter` interface and the `can(user, action, resource, entry?)` policy engine with roles, collection/singleton operation permissions, admin capabilities, field-level and entry-level rules; verify unit tests for each rule type (`createPolicy(roles)` in `runtime/shared/policy.ts` gives `can`, `ownOnly`, `fields`, `readable`, `unwritable`; roles are data; `admin` is built in. Entries start recording their creator, which own-only rules check, with 7.4)
- [x] 6.2 Implement the built-in adapter: users table, scrypt hashing with encoded params and PBKDF2 fallback, `nuxt/server` `useSession` sealed cookies with server-side session ids, logout/reset revocation; verify tests for hash verify/upgrade, cookie flags, and revoked session rejection (`atelier_users`, `atelier_sessions` storing a SHA-256 of the cookie's id; `/api/_atelier/auth/login|logout|me`; `useAtelierAuth()`; exports include users but not sessions)
- [x] 6.3 Implement optional passkey sign-in for the built-in adapter (`auth.passkeys`, off by default) with `@simplewebauthn/server` + lazy-loaded `@simplewebauthn/browser`, `user_passkeys` table, RP ID from the public site URL, required user verification, counter check, audit events; verify register + sign-in e2e with a Playwright virtual authenticator, and that passkey endpoints return 404 and no passkey chunk ships when disabled (server side and e2e done: routes under `/api/_atelier/auth/passkeys/` are registered only when enabled, `atelier_passkeys`, the challenge in a 5-minute sealed cookie, RP from the site URL or the request origin when unset. The admin sign-in screen's passkey option and its lazy chunk are verified in 15.4; the audit events in 6.6)
- [x] 6.4 Implement first-run administrator setup and last-administrator protection; verify e2e: setup screen appears only with zero users, and demoting the last admin is refused (API verified: `/api/_atelier/setup` is open only with zero users, seeds an `editor` role and signs the admin in; `/api/_atelier/users` refuses demoting or deleting the last admin, and keeps non-admins with the `users` capability away from the admin role and their own role. Roles: `atelier_roles` plus `server/atelier/roles.ts` (`defineRoles`), managed at `/api/_atelier/roles`. The setup screen itself is verified with the admin in 15.4)
- [ ] 6.5 Implement CSRF protection (Origin/Sec-Fetch-Site checks + double-submit token for admin) and login rate limiting; verify cross-site POST rejection and 429 after limit
- [ ] 6.6 Implement audit log for logins (password and passkey), failures, role/permission changes, tokens, passkey registrations and removals, publishes, deletions; verify entries recorded with actor/target/time in integration tests
- [ ] 6.7 Implement `@nuxt-atelier/auth-better-auth` following the official Better Auth Nuxt integration (catch-all handler, `better-auth/vue`, SSR session via `useSession(useFetch)`), Drizzle adapter on the CMS database, CMS role mapping; verify e2e OAuth login against a mock provider maps to a CMS role
- [ ] 6.8 Write docs: users and roles guide (editors), permissions reference, built-in auth and passkeys, Better Auth setup (OAuth, 2FA, passkeys), writing a custom auth adapter, security notes

## 7. Content API (content-api)

- [ ] 7.1 Implement REST handlers under `/api/_atelier/**` with `nuxt/server` (`defineHandler`, `readValidatedBody`) for collections, singletons, routes, revisions, auth, using `{nitro2, nitro3}` variants where needed; verify integration tests on Nuxt 4 and `compatibilityVersion: 5`
- [ ] 7.2 Implement query language (filters with and/or, comparisons, contains, in, null; sort; field selection; offset + cursor pagination; locale; populate depth) with bounded page size and depth; verify unit tests and capped page size response
- [ ] 7.3 Implement published-only default reads and draft access requiring preview permission; verify anonymous draft request returns the published version or 404
- [ ] 7.4 Enforce permissions per operation, strip unreadable fields, refuse writes to read-only fields, and record each entry's creator (`_created_by`) for own-only rules; verify field-omission, 403 and own-entries-only tests
- [ ] 7.5 Implement the structured error shape (code, message, field details; 401/403/404/409/422/429); verify snapshot tests of error bodies
- [ ] 7.6 Implement scoped API tokens (hashed, expiring, revocable); verify revoked token → 401 and scope enforcement tests
- [ ] 7.7 Implement typed server (`#atelier/server`) and client (`useAtelierQuery`, `useAtelierEntry`) helpers using Nuxt `useAsyncData`/`useFetch` for SSR; verify type tests and an SSR fixture rendering queried content
- [ ] 7.8 Generate the OpenAPI document endpoint from schemas; verify it validates against the OpenAPI 3.1 schema in tests
- [ ] 7.9 Write docs: REST API reference, query language, typed helpers, API tokens, error codes

## 8. Block system and rendering (block-system)

- [ ] 8.1 Implement the SFC macro parser (`@vue/compiler-sfc` + `oxc-parser`) statically evaluating `defineBlock({...})` and field helpers in `defineProps`, with file:line diagnostics for non-static expressions; verify unit tests for valid blocks and each diagnostic
- [ ] 8.2 Implement the Vite transform (via `addVitePlugin`) that strips the macro and rewrites field helpers into plain prop declarations with sourcemaps, operating only on `.vue` ids without queries; verify the transformed output test and runtime prop behaviour
- [ ] 8.3 Implement `*.block.ts` schema-file blocks referencing any component (including third-party); verify a fixture using a Nuxt UI component as a block
- [ ] 8.4 Implement block discovery across layers by priority with same-name override (no error) and the generated block registry + server validators via `addTemplate`/`addServerTemplate`, regenerated on `builder:watch`; verify a layer-override fixture and dev HMR test
- [ ] 8.5 Implement nested block areas with allow/deny by name/group/tag and min/max, enforced server-side; verify API rejection of disallowed nesting
- [ ] 8.6 Implement block options passed as props; verify option change re-render test
- [ ] 8.7 Implement `<AtelierBlocks>`/`<AtelierField>` rendering with lazy component imports, unknown-block skip + warning, and preview-only data attributes; verify SSR output contains no editing attributes for public requests
- [ ] 8.8 Implement schema reconciliation: detect orphaned/missing fields and areas on load, keep entries loadable and saveable, expose repair operations; verify removed-field and added-area tests
- [ ] 8.9 Add UI-agnostic fixtures (Nuxt UI, shadcn-vue via `shadcn-nuxt` 2.9, Tailwind-only, plain CSS) rendering the same content; verify e2e snapshots per fixture
- [ ] 8.10 Write docs: block authoring (macro style and schema-file style), nesting rules, options, overriding blocks from layers, using different UI libraries, reconciliation and repairing content

## 9. Site routing and redirects (site-routing)

- [ ] 9.1 Implement routable content types with URL patterns and per-type page component/layout, plus the lowest-priority catch-all page via `extendPages`; verify publishing `about` serves `/about`
- [ ] 9.2 Verify host route precedence with a fixture where `pages/contact.vue` shadows a CMS entry, and implement the admin shadowing warning data
- [ ] 9.3 Implement unique per-locale hierarchical paths with descendant updates and optional automatic redirects; verify parent rename test
- [ ] 9.4 Implement 404 for unpublished/missing paths via the host error page; verify status 404 e2e
- [ ] 9.5 Implement redirects (patterns, 301/302/307/308, loop detection) evaluated in server middleware from a cached map; verify loop refusal and redirect e2e
- [ ] 9.6 Implement id-based internal links resolved at render and `useAtelierRouteEntry()` composable; verify renamed-target link test and typed entry in a host layout
- [ ] 9.7 Write docs: routable content, URL patterns, host page precedence, redirects guide

## 10. Content lifecycle (content-lifecycle)

- [ ] 10.1 Implement draft/published pointers on entries with append-only revisions and transactional publish/unpublish; verify public reads stay on the published version after a draft save
- [ ] 10.2 Implement revision listing with retention policy; verify retention job prunes per policy while keeping published revisions
- [ ] 10.3 Implement block-aware diff (add/remove/move/field change keyed by block id) and restore-as-new-draft; verify diff unit tests and restore e2e
- [ ] 10.4 Implement scheduled publish/unpublish executed by jobs, pinning the scheduled revision; verify fake-clock tests using `date-fns`/`@date-fns/tz` (UTC storage, user time zone display)
- [ ] 10.5 Implement preview mode on site routes and expiring shared preview links (signed with `deriveSecret`); verify expired link shows the expiry message and no draft content
- [ ] 10.6 Implement cache invalidation hooks for publish/unpublish/delete; verify republished cached page serves new content
- [ ] 10.7 Write docs: drafts and publishing (editors), revisions and restore, scheduling, preview links

## 11. Jobs, hooks, webhooks, CLI (extensibility)

- [ ] 11.1 Implement typed lifecycle hooks (before/after create, update, delete, publish, unpublish, read) with abort semantics and after-hook failure isolation; verify tests for abort and logged after-hook failure
- [ ] 11.2 Implement the DB-backed job queue (atomic claim, `SKIP LOCKED` where supported, backoff, max attempts, concurrency limits) drained by the `atelier:jobs` Nitro task (`experimental.tasks` + `scheduledTasks` via `nitro:config`, `{nitro2, nitro3}` variants), code-defined recurring schedules as `scheduledTasks`, `croner` only for runtime recurrences, and an authenticated trigger endpoint calling `runTask` for unsupported platforms; verify retry-then-fail, trigger time-budget, `nuxi task run atelier:jobs` draining the queue, and Vercel preset output containing the generated cron
- [ ] 11.3 Implement outgoing webhooks signed per Standard Webhooks (Web Crypto HMAC), delivered via jobs, logged, with SSRF guard (DNS resolve + private range block + allowlist); verify signature verification and private-address refusal tests
- [ ] 11.4 Implement the plugin contract (layers/modules contributing collections, fields, blocks, hooks, jobs, admin pages, editor features, translations); verify an example plugin package in `test/fixtures` contributes a field and an admin page
- [ ] 11.5 Implement the `atelier` CLI (init, migrate, user create-admin/reset-password, export/import, jobs run); verify CLI integration tests including reset-password invalidating sessions
- [ ] 11.6 Write docs: hooks reference, jobs and scheduling (including serverless trigger setup), webhooks with signature verification examples, building plugins, CLI reference

## 12. Media library (media-library)

- [ ] 12.1 Implement the streaming storage driver interface and local driver (`.data/uploads`, immutable cache headers, no `public/` symlinks); verify uploads persist across dev restarts
- [ ] 12.2 Implement `@nuxt-atelier/storage-s3` (S3-compatible and R2 via `aws4fetch`) and `@nuxt-atelier/storage-vercel-blob`; verify integration tests against MinIO and a Vercel Blob mock
- [ ] 12.3 Implement uploads with size/type limits and `file-type` content sniffing; verify disguised executable rejection
- [ ] 12.4 Implement media metadata (localized alt text, caption, credits), folders, tags, search; verify tag search test
- [ ] 12.5 Implement image variants via optional `ipx` + `sharp` with focal-point crops, `@nuxt/image` delegation when installed, and external-provider fallback on edge; verify focal-crop test and Workers smoke test serving originals or provider URLs
- [ ] 12.6 Implement `<AtelierImage>`/`<AtelierPicture>` with responsive markup and intrinsic dimensions; verify no-layout-shift markup snapshot
- [ ] 12.7 Implement usage tracking and safe delete with usage listing; verify delete-in-use warning test
- [ ] 12.8 Implement ephemeral-filesystem warning for local driver on known ephemeral targets; verify warning emitted in a Vercel preset build
- [ ] 12.9 Write docs: media guide (editors), storage drivers setup, image processing and providers, edge limitations

## 13. Localization (localization)

- [ ] 13.1 Implement locale config, localized content types, per-field translated/shared, translation groups, and fallback chains; verify shared-field propagation and fallback-indicator tests
- [ ] 13.2 Implement localized block strategies (independent trees vs shared structure with translated fields); verify shared-structure reorder test
- [ ] 13.3 Implement the `I18nAdapter` with auto-detection order (nuxt-i18n-micro → @nuxtjs/i18n → none) and adapter packages `@nuxt-atelier/i18n-micro` and `@nuxt-atelier/i18n-nuxtjs`; verify localized routes in fixtures for each and API-only locales without either
- [ ] 13.4 Add an explicit CI job for the nuxt-i18n-micro adapter under `compatibilityVersion: 5` documenting current status; verify the job reports pass/fail without blocking other jobs
- [ ] 13.5 Implement lazily loaded admin interface catalogs (English shipped) extensible by host/plugins; verify switching admin language independent of content locale
- [ ] 13.6 Write docs: translating content (editors), locale configuration, i18n adapters and route strategies, adding admin languages

## 14. Visual editor (visual-editor)

- [ ] 14.1 Implement preview token issuance (short-lived, HMAC via `deriveSecret`) exchanged for an HTTP-only preview cookie, and the core client plugin that dynamically imports the bridge only in preview context; verify public page bundle contains no bridge chunk and invalid token renders public content
- [ ] 14.2 Define the versioned bridge protocol with Valibot-validated messages and origin checks; verify foreign-origin and malformed messages are ignored in unit tests
- [ ] 14.3 Implement the child bridge: reactive in-memory edit state from patches, geometry reporting via VueUse observers, selection/hover events; verify edits render within 150 ms in e2e
- [ ] 14.4 Implement the parent editor shell (`@nuxt-atelier/editor`): iframe host, overlay drawn in parent from reported geometry, structure tree, side panel forms (TanStack Form + Valibot), responsive presets; verify click-to-select syncs tree and panel in e2e
- [ ] 14.5 Implement add/move/duplicate/delete with `@atlaskit/pragmatic-drag-and-drop` in tree and picker plus relayed in-preview dragging respecting placement rules; verify invalid drop rejection e2e
- [ ] 14.6 Implement inline text/rich-text editing (Tiptap 3) in the preview synced to the admin form; verify inline edit e2e
- [ ] 14.7 Implement command-pattern undo/redo with keystroke coalescing and keyboard shortcuts (`useMagicKeys`) plus an extensible command palette; verify undo-move and palette insert e2e
- [ ] 14.8 Implement proxy editing mode for opted-in blocks; verify carousel proxy reorder e2e
- [ ] 14.9 Verify style isolation with a fixture applying hostile global CSS (`* { box-sizing: content-box }`, `button { all: unset }`): admin chrome renders correctly and preview matches the public page screenshot
- [ ] 14.10 Implement keyboard-only block moving with live-region announcements and run axe on editor chrome; verify no serious/critical violations and keyboard move e2e
- [ ] 14.11 Write docs: visual editor guide for editors (with screenshots), editor architecture and bridge protocol reference, making blocks editor-friendly, proxy mode, extending the editor

## 15. Admin dashboard (admin-dashboard)

- [ ] 15.1 Implement headless admin composables (collections, entry form with TanStack Form + Valibot, permissions, navigation, list state) backed by TanStack Query 5; verify composable unit tests with a mocked API
- [ ] 15.2 Implement admin mounting: `extendPages` for `${base}/**`, client-only route rules, noindex, teleported `<atelier-admin>` custom element with Shadow DOM, adopted stylesheets, document-level Tailwind `@property` registrations, `UApp` portal into the shadow root; verify e2e that host global CSS does not affect admin and admin CSS is absent on public pages Also add the overridable admin page file to `@nuxt-atelier/layer` (deferred from 3.5).
- [ ] 15.3 Implement headless mode (core without `@nuxt-atelier/admin`) adding no admin route or assets; verify fixture test
- [ ] 15.4 Implement the Nuxt UI 4 kit: first-run setup screen (shown only while `/api/_atelier/setup` says it's needed), sign-in screen (a passkey option only with `auth.passkeys`, lazy-loading `@simplewebauthn/browser`), users and roles screens, shell/navigation, collection list views (`UTable` with Nuxt UI-pinned table version, filters, column selection, bulk actions, pagination), schema-generated edit views, field inputs for every field type, and a custom field type's `input` component; verify e2e CRUD for a collection that a `geo-point` field renders its custom input, and that with passkeys off the sign-in screen has no passkey option and no passkey chunk loads
- [ ] 15.5 Implement theming via app config (tokens, light/dark, branding) mapped to `--at-*`/`--ui-*`, and name-based component overrides from host/layers; verify brand color and date-input override tests Apply the layer's `AtelierTheme` tokens inside the admin's shadow root (its `<style>` is injected into the document head, which the shadow root doesn't see).
- [ ] 15.6 Implement custom admin pages with navigation, icons, ordering, permissions, and the shadow-root portal composable for third-party overlays with a dev warning; verify permission-gated page test
- [ ] 15.7 Implement dashboard home widgets (activity, drafts, scheduled, failed jobs, pending migrations) using `@tanstack/vue-charts` where charts are needed; verify failed-job widget e2e
- [ ] 15.8 Implement unsaved-changes guard and local recovery copies (VueUse storage); verify crash-recovery e2e
- [ ] 15.9 Verify WCAG 2.2 AA with axe across core admin views and tablet viewport e2e; fix violations until the suite reports none serious/critical
- [ ] 15.10 Write docs: admin tour (editors), theming and branding, overriding admin components, custom admin pages and widgets, building an alternative admin kit on the headless composables

## 16. Editorial collaboration (editorial-collaboration)

- [ ] 16.1 Implement edit locks with heartbeat renewal (`useIntervalFn`), inactivity expiry, read-only mode for others, and takeover with recoverable draft preservation; verify lock, expiry, and takeover e2e
- [ ] 16.2 Implement presence indicators via heartbeat polling; verify two-session presence e2e
- [ ] 16.3 Implement the real-time transport (`atelier.realtime: 'auto'`): `nitro.experimental.websocket` on supported presets, `defineWebSocketHandler` at `/api/_atelier/ws` with session + Origin check in `upgrade`, invalidation events for locks/presence/comments/notifications, 60 s reconciliation poll while connected, 20 s polling fallback; verify cross-session lock push within 2 s e2e, forced-fallback e2e, and forged-Origin upgrade rejection test
- [ ] 16.4 Implement entry and block comments with threads, mentions, resolve, and orphaned-block handling, displayed in preview and panel; verify comment-on-block and deleted-block tests
- [ ] 16.5 Implement in-admin notifications and optional email delivery through the `MailAdapter` (SMTP via optional `nodemailer`, HTTP providers); verify mention notification test
- [ ] 16.6 Write docs: collaboration guide (locks, comments, notifications), real-time transport and platform support, mail adapter configuration

## 17. Reusable content (reusable-content)

- [ ] 17.1 Implement shared blocks (references, publish propagation), detach to local copy, usage listing, and delete protection; verify 20-page propagation and detach tests
- [ ] 17.2 Implement patterns (code-defined and editor-saved) inserted as independent copies; verify insert-pattern test
- [ ] 17.3 Implement entry templates (code and saved-from-entry); verify new-from-template test
- [ ] 17.4 Implement clipboard copy/paste across areas, entries, and tabs with fresh ids and rule checks; verify cross-entry paste e2e
- [ ] 17.5 Write docs: shared blocks, patterns, templates, copy/paste (editors and developers)

## 18. SEO (seo-metadata)

- [ ] 18.1 Implement SEO field group with fallbacks and SSR head output via `useSeoMeta`/`useHead`; verify no-JS crawler fetch contains title, description, canonical, OG tags
- [ ] 18.2 Implement localized alternates and JSON-LD mapping (site-level and per type); verify hreflang and Article JSON-LD tests
- [ ] 18.3 Implement sitemap and robots: integrate with `@nuxtjs/sitemap`/`@nuxtjs/robots` when installed, minimal built-ins otherwise, excluding noindex/unpublished and disallowing admin/API paths; verify both modes in fixtures
- [ ] 18.4 Implement admin SEO previews and non-blocking checks; verify missing-description warning test
- [ ] 18.5 Write docs: SEO guide (editors), SEO configuration, structured data mapping, sitemap/robots integration

## 19. Search (content-search)

- [ ] 19.1 Implement searchable field declarations with weights and the `search_documents` index maintained on publish/unpublish/delete plus CLI/admin rebuild; verify index freshness test
- [ ] 19.2 Implement engine-native full-text search (SQLite FTS5, Postgres tsvector + GIN, MySQL FULLTEXT) behind a `SearchAdapter`, with parameter-bound plain-term tokenisation and length limits; verify identical-result-shape tests across engines and injection-input tests
- [ ] 19.3 Implement the public search endpoint/helper (published-only, ranking, highlighted excerpts, pagination, locale/type filters, rate limit); verify draft exclusion test
- [ ] 19.4 Implement admin global search with permission filtering and keyboard shortcut; verify restricted-collection exclusion e2e
- [ ] 19.5 Write docs: site search integration, admin search, external search adapters

## 20. Forms (forms)

- [ ] 20.1 Implement form definitions as a built-in collection with field types, per-field validation, localized labels, success message/redirect; verify definition validation tests
- [ ] 20.2 Implement the form block rendered with TanStack Form + generated Valibot schema, accessible markup, server re-validation, restylable/replaceable components; verify bypassed-client-validation rejection test and axe check
- [ ] 20.3 Implement submissions storage, admin views, filters, CSV/JSON export, and retention job; verify retention deletion test
- [ ] 20.4 Implement spam protection (honeypot, min fill time, rate limit) and the `ChallengeAdapter` with built-in Cloudflare Turnstile verification; verify honeypot silent-discard and Turnstile verification tests with a mocked endpoint
- [ ] 20.5 Implement private form file uploads, notification and confirmation emails via jobs, submission hooks/webhook events, consent fields, and erasure by email; verify private file access denial and erasure tests
- [ ] 20.6 Write docs: building forms (editors), form submissions and privacy, spam protection and challenge adapters, form events

## 21. Multi-site (multi-site)

- [ ] 21.1 Implement site definitions (hostnames, locales, settings), host-based resolution middleware into `event.context.atelier.site`, fallback site handling; verify host resolution and unknown-host tests
- [ ] 21.2 Make site context a required argument in the data-access layer for site-scoped tables and support shared content types; verify type-level test that omitting site context fails to compile
- [ ] 21.3 Implement per-site roles, per-site media, redirects, sitemaps, robots, and search indexes; verify restricted editor e2e and per-site sitemap test
- [ ] 21.4 Add the cross-site isolation test matrix covering every content, media, form, and search endpoint; verify it passes and fails when a scope check is removed
- [ ] 21.5 Write docs: multi-site setup, content scoping, per-site permissions, deployment with multiple domains

## 22. AI assist (ai-assist)

- [ ] 22.1 Implement `@nuxt-atelier/ai` with the `AiAdapter` interface and AI SDK 7 implementation, server-only endpoints, dedicated permission, rate/usage limits, and field/type exclusions; verify keys never appear in client payloads and excluded fields are never sent
- [ ] 22.2 Implement admin actions (alt text, translate field/block, SEO suggestions, rewrite/shorten/expand) as lazy-loaded suggestion UI with accept/edit/discard and undo; verify disabled-by-default bundle check and discard test
- [ ] 22.3 Implement AI usage audit and reporting view; verify usage report test
- [ ] 22.4 Write docs: enabling AI assist, choosing a provider, privacy controls and exclusions, usage limits

## 23. Performance, safety, operations (runtime-performance)

- [ ] 23.1 Add `size-limit` budget (≤15 KB gzip CMS JS on the plain-css public page) to CI; verify a deliberate import of an editor module into the public path fails the check
- [ ] 23.2 Add the server benchmark (cached ≤50 ms p95, uncached 50-block ≤200 ms p95) on GitHub-hosted runners comparing against a rolling median baseline with >10% regression failure; verify the job reports numbers and fails on an injected slowdown
- [ ] 23.3 Add the query-count guard (Drizzle logger wrapper) proving bounded queries for 200 blocks/20 relations; verify it fails on an introduced N+1
- [ ] 23.4 Implement the unified `limits` config (body, upload, page size, depth, nesting, job concurrency, pool size, cache size) validated at boot; verify oversized page size and deep nesting tests
- [ ] 23.5 Verify streaming for uploads/downloads/export/import with a memory-ceiling test on a large export
- [ ] 23.6 Implement published-content and route caching with invalidation and no shared caching for authenticated/preview responses; verify preview response cache headers test
- [ ] 23.7 Implement security headers/CSP (admin frame-ancestors restricted to self), required production secrets check, and rich-text XSS-safe storage/rendering via schema-constrained ProseMirror JSON + `@tiptap/static-renderer`; verify missing-secret startup failure and stored-XSS tests
- [ ] 23.8 Implement health live/ready endpoints, structured JSON logging with redaction and correlation ids, and graceful shutdown requeueing running jobs; verify DB-down readiness 503 and shutdown requeue tests
- [ ] 23.9 Add `bun audit`, `knip`, and dependency-justification check (every runtime dependency listed with purpose in docs) to CI; verify an unused dependency fails CI
- [ ] 23.10 Write docs: performance tuning, limits reference, caching, security hardening, operations (health, logs, shutdown), dependency list with justifications

## 24. Compatibility and deployment matrix

- [ ] 24.1 Extend CI matrix: Nuxt latest 4.x, Nuxt 4.x with `compatibilityVersion: 5`, `nuxt-nightly@5x`; databases SQLite/Postgres/MySQL/MariaDB; runtimes Node 22/24/26, Bun, Deno; verify the full matrix is green
- [ ] 24.2 Add a non-blocking TypeScript 7 + Vue language tools v4 job; verify it runs and reports status without gating merges
- [ ] 24.3 Add deploy smoke tests: Docker image of the playground, Vercel and Netlify preset builds, Cloudflare Workers build-and-run with documented limitations; build each from the example files the deployment guides show (24.4); verify each produces a running app answering the health endpoint
- [ ] 24.4 Write docs: a hosting guide per platform with a complete example (build command and preset, config files, env vars, database, migrations on deploy, media storage, scheduled jobs, real-time support, limitations): Node on a VPS (systemd), Docker and Docker Compose with Postgres, Dokploy and Coolify, Fly.io, Railway, Render, Bun, Deno, Vercel, Netlify, Cloudflare Workers (D1 limitations); plus the upgrade guide and Nuxt 5 readiness notes; verify every guide's example files are the ones 24.3 builds

## 25. Docs demos and hosting (documentation-site)

- [ ] 25.1 Build MDC demo components in `docs/components/content/` mounting real blocks, field inputs, and the visual editor against the in-memory per-session demo adapter with scheduled reset; verify a demo edit is visible only in that session and resets
- [ ] 25.2 Generate the API reference (composables, components, server utilities, REST endpoints, CLI) from TSDoc and schemas into the docs; verify a changed signature updates the generated page in CI
- [ ] 25.3 Enable machine-readable docs indexes (`llms.txt`) and verify the deployed path returns the index
- [ ] 25.4 Audit docs completeness: every admin-visible feature has an editor guide and every public API has reference docs; verify the completeness check script passes
- [ ] 25.5 Confirm the GitHub repository owner/name and deploy branch with the maintainer, then create the Dokploy project "Nuxt Atelier" and application "Nuxt Atelier Docs" via the existing GitHub App (Dockerfile build `docs/Dockerfile`, context `.`, watch paths `docs/**`, `packages/**`, `package.json`, `bun.lock`, auto-deploy on push) with HTTPS domain `nuxt-atelier.anorebel.net` on port 3000; verify the deployment succeeds and `https://nuxt-atelier.anorebel.net` serves the docs and a working live demo

## 26. Release readiness (integration checks)

- [ ] 26.1 Run the full e2e journey across the matrix: install → first admin → define schema and blocks → build a page visually → translate → schedule publish → verify public SSR output, SEO, sitemap, search; verify green on every matrix cell
- [ ] 26.2 Run the spec-coverage check mapping every spec scenario to at least one automated test; verify no scenario is unmapped
- [ ] 26.3 Run a security review pass (auth, CSRF, SSRF, XSS, upload, tenant isolation, secrets in logs) and resolve findings; verify the review checklist is complete with no open high/critical items
- [ ] 26.4 Publish `0.x` pre-releases to npm under the `next` tag with `bun publish` (resolving `catalog:`), using Changesets for versions and generated changelogs only, plus a CI pack check that fails if a tarball still contains `catalog:`; verify packages install into a fresh Nuxt 4.6 app and the quick start works as documented

## 27. Nuxt DevTools integration (module-integration)

- [ ] 27.1 Create `@nuxt-atelier/devtools` (dev dependency, `@nuxt/devtools-kit` 4.1.0) registering only in dev with DevTools enabled: DevTools 4 docks and RPC via `onDevtoolsReady`, falling back to `addCustomTab`/`extendServerRpc` on DevTools 3; verify a dev fixture shows the tabs on DevTools 3 and 4, and nothing registers with DevTools disabled or the package absent
- [ ] 27.2 Add the Schema and Migrations panels (collections, singletons, fields and tables; applied and pending migrations, the flags a blocked drop/rename needs, an apply action over `atelier:` RPC refused when `devtools.disableAuthorization` is set); verify panel data matches `atelier migrate status` and the apply action is refused without authorization
- [ ] 27.3 Add the admin tab (`/admin` in an iframe) and, once section 11 exists, the Jobs panel (queue, retry); verify both in the dev fixture
- [ ] 27.4 Verify a production build of an app with the integration installed contains no DevTools code (bundle scan)
- [ ] 27.5 Write docs: installing the DevTools integration, the panels, and its security notes
