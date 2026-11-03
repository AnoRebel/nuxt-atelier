# Spec Delta

## Purpose

Provides one documentation and demo website plus repository documentation that let users, developers, and contributors adopt, extend, operate, and contribute to Nuxt Atelier.

## ADDED Requirements

### Requirement: Docus documentation site
The project SHALL include a documentation site built on Docus that installs the project's own packages from the workspace, so documentation always reflects the current source.

#### Scenario: Docs build with workspace packages
- **WHEN** the docs site is built in CI
- **THEN** it compiles against the workspace packages and fails if any example component or demo breaks

### Requirement: Live interactive demos
The docs SHALL embed live demos of blocks, field types, and the visual editor running the actual packages, backed by an isolated demo dataset that resets automatically and cannot be used to persist arbitrary user content.

#### Scenario: Demo reset
- **WHEN** a visitor modifies content in the live editor demo
- **THEN** changes are visible in their session only and the demo data is reset on the documented schedule

### Requirement: User documentation
The docs SHALL include editor-facing guides: logging in, creating and editing pages, using the visual editor, media, translations, revisions and scheduling, comments, forms, and search.

#### Scenario: Editor guide coverage
- **WHEN** a feature visible in the admin is released
- **THEN** a corresponding editor guide page exists

### Requirement: Developer documentation
The docs SHALL include installation, configuration reference (every option with type, default, and example), schema and field reference, block authoring (both definition styles), adapters (content, auth, i18n, storage, search, AI), hooks, jobs, webhooks, plugins, admin customization and theming, using different UI libraries for blocks, deployment guides per supported target with limitations, upgrade guides, security, and performance tuning.

#### Scenario: Config reference completeness
- **WHEN** CI compares the module's option schema with the configuration reference
- **THEN** it fails if any option is undocumented

### Requirement: Deployment guides with working examples
The docs SHALL include a hosting guide with a complete, copyable example for each supported platform: Node on a VPS (systemd), Docker and Docker Compose, Dokploy and Coolify, Fly.io, Railway, Render, Bun, Deno, Vercel, Netlify, and Cloudflare Workers.

#### Scenario: Guide contents
- **WHEN** a developer opens a platform's hosting guide
- **THEN** it shows the build command and Nitro preset, the configuration files (e.g. `Dockerfile`, `compose.yaml`, `vercel.json`, `netlify.toml`, `wrangler.toml`, `fly.toml`), required environment variables, the database connection, how migrations are applied on deploy, media storage, scheduled jobs, and real-time support

#### Scenario: Examples stay correct
- **WHEN** CI runs the deploy smoke tests
- **THEN** each guide's example configuration is the one the smoke test builds, so a broken example fails CI

#### Scenario: Platform limitations
- **WHEN** a feature isn't available on a platform (e.g. local file uploads on an ephemeral filesystem, multi-statement transactions on D1)
- **THEN** that platform's guide says so and names the alternative (e.g. an S3-compatible storage adapter)

### Requirement: API reference
The docs SHALL include a generated reference for public composables, components, server utilities, REST endpoints, and CLI commands.

#### Scenario: Generated reference
- **WHEN** a public API signature changes
- **THEN** the regenerated reference reflects the change in the same release

### Requirement: Contributor documentation
The repository SHALL include contributing guidelines (setup, architecture overview, coding standards, testing, commit and branch conventions, release process), a code of conduct, a security policy with a private disclosure process, and issue/PR templates.

#### Scenario: New contributor setup
- **WHEN** a contributor follows the setup guide on a clean machine
- **THEN** they can install, run the playground, run tests, and build the docs with the documented commands

### Requirement: Changelog and migration notes
Every release SHALL have a changelog entry generated from semantic commits, and any breaking change SHALL include migration instructions.

#### Scenario: Breaking change release
- **WHEN** a release contains a breaking change
- **THEN** its changelog entry links to migration instructions

### Requirement: Machine-readable docs
The docs site SHALL publish machine-readable documentation indexes (e.g. `llms.txt`) for tooling consumption.

#### Scenario: Index available
- **WHEN** the deployed docs site is requested at the documented index path
- **THEN** a plain-text index of documentation pages is returned
