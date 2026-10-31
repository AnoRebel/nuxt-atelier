# Spec Delta

## Purpose

Persists content safely in the built-in relational backend and defines the public adapter contract that lets any other backend power the same admin and visual editor.

## ADDED Requirements

### Requirement: Supported databases
The built-in backend SHALL support SQLite/libSQL, PostgreSQL, and MySQL/MariaDB, selected by a connection URL, with identical behavior across them for all CMS features.

#### Scenario: Switch database by URL
- **WHEN** the database URL changes from a SQLite file to a PostgreSQL URL and migrations are applied
- **THEN** all CMS features work against PostgreSQL without code changes

### Requirement: Edge database readiness
The storage layer SHALL keep edge databases (e.g. Cloudflare D1) behind the same driver interface; where a feature cannot be supported without transactions or native modules, it SHALL be documented and SHALL fail with a clear error rather than corrupting data.

#### Scenario: Unsupported operation on edge DB
- **WHEN** an operation requiring a multi-statement transaction runs on a driver without transaction support
- **THEN** it either runs via a documented safe alternative or fails with an error naming the limitation, leaving data unchanged

### Requirement: Explicit migrations
Schema changes SHALL produce reviewable migration files committed to the project; applying migrations SHALL be an explicit command or opt-in boot step, and destructive operations (drop column/table) SHALL require explicit confirmation in the migration.

#### Scenario: Removed field
- **WHEN** a developer removes a field and generates migrations
- **THEN** the migration does not drop the column unless the developer explicitly marks the drop as intended

#### Scenario: Pending migrations in production
- **WHEN** the app starts in production with pending migrations and auto-apply disabled
- **THEN** the app logs which migrations are pending and CMS write endpoints refuse writes with a clear error

### Requirement: Dev auto-migrate
In development, schema changes SHALL be applied automatically for non-destructive changes, and destructive changes SHALL prompt the developer instead of applying silently.

#### Scenario: Add field in dev
- **WHEN** a field is added during `nuxt dev`
- **THEN** the database is updated and the field is usable without manual steps

### Requirement: Atomic writes
Saving an entry with nested blocks, relations, and revision record SHALL be atomic: either all changes persist or none do.

#### Scenario: Failure mid-save
- **WHEN** a save fails after writing some rows
- **THEN** no partial data is visible and the previous version remains intact

### Requirement: Optimistic concurrency
Writes SHALL include the version the client last read; a write against a stale version SHALL be rejected with a conflict error rather than silently overwriting.

#### Scenario: Stale save
- **WHEN** two sessions edit the same entry and the second saves after the first
- **THEN** the second save is rejected with a conflict response containing the current version

### Requirement: Content adapter contract
The system SHALL publish a versioned content adapter contract with required operations (load entry/edit state, list block types and field config, add/move/update/delete blocks, save, permissions) and optional operations; the built-in backend SHALL be one implementation of it.

#### Scenario: External backend
- **WHEN** a developer configures an adapter implementing only the required operations for an external CMS
- **THEN** the visual editor works for adding, moving, editing, and saving blocks against that backend

### Requirement: Capability-driven features
Editor and admin features that depend on optional adapter operations SHALL be automatically disabled when the configured adapter does not implement them.

#### Scenario: No revisions support
- **WHEN** the configured adapter does not implement revision operations
- **THEN** the revision history UI is hidden and no revision calls are made

### Requirement: Backup and export
The system SHALL provide a CLI command to export all content, media metadata, and settings to a portable archive and import it into another instance, including across database engines.

#### Scenario: SQLite to PostgreSQL
- **WHEN** content exported from a SQLite instance is imported into an empty PostgreSQL instance
- **THEN** all entries, revisions, relations, and media references are present and identical
