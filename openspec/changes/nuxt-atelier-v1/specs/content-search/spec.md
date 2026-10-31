# Spec Delta

## Purpose

Lets site visitors search published content and admin users find any content, media, or setting quickly, using the configured database without an external search service by default.

## ADDED Requirements

### Requirement: Searchable fields
Content types SHALL declare which fields (including text inside blocks) are searchable and their relative weight.

#### Scenario: Weighted title
- **WHEN** `title` has a higher weight than `body` and two entries match a query, one in the title and one in the body
- **THEN** the title match ranks first

### Requirement: Public site search
The system SHALL provide a public search endpoint and query helper returning only published, publicly readable entries, with ranking, highlighted excerpts, pagination, locale, and type filters.

#### Scenario: Draft excluded
- **WHEN** a visitor searches a term that appears only in an unpublished draft
- **THEN** no result is returned for that draft

### Requirement: Index freshness
The search index SHALL update on publish, unpublish, and delete, and SHALL be fully rebuildable via the CLI and admin.

#### Scenario: Published content searchable
- **WHEN** an entry is published
- **THEN** it is returned by search queries within the configured indexing delay

### Requirement: Engine portability
Search SHALL work on every supported database using its native full-text capabilities, and SHALL allow an external search provider via an adapter.

#### Scenario: Same API across databases
- **WHEN** the same search query runs against SQLite and PostgreSQL instances with identical content
- **THEN** both return the matching entries through the same response shape

### Requirement: Admin global search
The admin SHALL provide a global search (keyboard shortcut) across entries, media, users, and settings, respecting the user's permissions.

#### Scenario: Permission filtering
- **WHEN** a user without access to `invoices` uses global search
- **THEN** no `invoices` entries appear in results

### Requirement: Query safety
Search input SHALL be length-limited and treated as data, never as query syntax, and the endpoint SHALL be rate limited.

#### Scenario: Injection attempt
- **WHEN** a visitor submits search input containing SQL or full-text operator syntax
- **THEN** it is treated as plain text and no error or data leak occurs
