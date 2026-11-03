# Spec Delta

## Purpose

Defines how Nuxt Atelier is installed into, configured within, and kept compatible with a host Nuxt application across current and future Nuxt major versions.

## ADDED Requirements

### Requirement: Install as a Nuxt module
The system SHALL be installable by adding a single module entry to the host app's `modules` list and SHALL work with zero configuration using sane defaults (local SQLite database, local file storage, built-in auth, admin at `/admin`).

#### Scenario: Zero-config install
- **WHEN** a developer adds `nuxt-atelier` to `modules` in a fresh Nuxt app and runs the dev server
- **THEN** the app starts, the admin is reachable at `/admin`, and a first-run setup flow prompts for the initial administrator account

### Requirement: Optional starter layer
The system SHALL provide an optional Nuxt layer that adds overridable admin page and theme files on top of the module, and the module SHALL NOT require that layer.

#### Scenario: Module without layer
- **WHEN** the module is installed without extending the starter layer
- **THEN** all CMS features work and no layer files are required

#### Scenario: Overriding a layer file
- **WHEN** the host app defines a file with the same path as one provided by the starter layer
- **THEN** the host app's file is used instead of the layer's file

### Requirement: Non-invasive host integration
The system SHALL NOT replace or require changes to the host's `app.vue`, root element id, global layouts, or existing pages, and SHALL coexist with pages the host app already defines.

#### Scenario: Existing app with pages
- **WHEN** the module is added to an app with its own `app.vue`, layouts, and pages
- **THEN** those continue to render unchanged and CMS-managed routes only handle paths not matched by host pages

### Requirement: Typed configuration
The system SHALL expose all options under a single typed config key with documented defaults, and SHALL validate configuration at build start, failing with an actionable error message for invalid values.

#### Scenario: Invalid option
- **WHEN** the config sets an unsupported database URL scheme
- **THEN** the build stops with an error naming the option, the invalid value, and the accepted values

### Requirement: Runtime configuration override
The system SHALL allow secrets and environment-specific settings (database URL, storage credentials, session secret, public site URL) to be overridden at runtime through environment variables without rebuilding.

#### Scenario: Env override
- **WHEN** a built app is started with a different database URL environment variable
- **THEN** the CMS connects to that database without a rebuild

### Requirement: Optional Nuxt DevTools integration
The project SHALL provide an optional, separately installed DevTools integration that adds Nuxt Atelier panels (content schema, migrations, background jobs, and the admin in a tab) to Nuxt DevTools during `nuxt dev`. It SHALL support DevTools 4 and fall back to the DevTools 3 API that Nuxt 4.6 ships, and SHALL add no code or dependency to production builds or to apps that don't install it.

#### Scenario: DevTools installed
- **WHEN** an app with the integration installed runs `nuxt dev` with DevTools enabled
- **THEN** the Nuxt Atelier panels appear in DevTools and show the app's schema and migration status

#### Scenario: Not installed or production
- **WHEN** the app doesn't install the integration, disables DevTools, or is built for production
- **THEN** no DevTools code is registered or bundled, and the module behaves the same

### Requirement: DevTools actions are authorized
DevTools actions that change data (applying migrations, retrying jobs) SHALL be namespaced `atelier:` and run only over DevTools' authorized connection.

#### Scenario: Authorization disabled
- **WHEN** the app sets `devtools.disableAuthorization`
- **THEN** the panels still show data, but actions that change data are refused

### Requirement: Supported Nuxt versions
The system SHALL support Nuxt 4.6 and later 4.x releases and SHALL support Nuxt 5 including its Nitro v3 server runtime, declaring its supported range in module metadata so unsupported versions fail early.

#### Scenario: Unsupported Nuxt version
- **WHEN** the module is installed in Nuxt 4.5
- **THEN** Nuxt reports a compatibility error naming the required version range

#### Scenario: Nuxt 5 runtime
- **WHEN** the module runs on Nuxt 5 with the Nitro v3 server runtime
- **THEN** all server endpoints, hooks, and jobs behave identically to Nuxt 4

### Requirement: Public API only
The system SHALL integrate with Nuxt, Nitro, Vite, and Vue only through documented public APIs and SHALL NOT read private (underscore-prefixed) options, rewrite framework-generated files, or depend on internal module id formats.

#### Scenario: Static check
- **WHEN** the repository's lint/check step runs
- **THEN** it fails if source code imports from a disallowed internal path or accesses a private framework option

### Requirement: Generated types
The system SHALL generate TypeScript types for the host app's collections, singletons, blocks, and fields, available to both app and server code, and SHALL refresh them when schema files change in development.

#### Scenario: Type refresh
- **WHEN** a developer adds a field to a collection definition during `nuxt dev`
- **THEN** the typed query results include the new field without restarting the dev server

### Requirement: Compiled distribution
Published packages SHALL ship compiled JavaScript and type declarations and SHALL NOT require the host to transpile TypeScript sources from the package.

#### Scenario: Install from registry
- **WHEN** a published package is installed into a Nuxt 5 app that does not bundle a TypeScript runtime loader
- **THEN** the module and its layer load successfully
