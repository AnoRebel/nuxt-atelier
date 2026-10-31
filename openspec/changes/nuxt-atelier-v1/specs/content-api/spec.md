# Spec Delta

## Purpose

Exposes content to the host app, admin, and external consumers through a typed, permission-checked REST API and typed query helpers usable on server and client.

## ADDED Requirements

### Requirement: REST endpoints per content type
The system SHALL expose CRUD REST endpoints under a prefixed base path for every collection and singleton, plus endpoints for media, routes, revisions, and auth.

#### Scenario: List entries
- **WHEN** an authorized client requests the list endpoint for `articles`
- **THEN** it receives a paginated JSON response with entries and total count

### Requirement: Querying
List endpoints and query helpers SHALL support filtering by field (equality, comparison, contains, in, null checks, and/or groups), sorting, field selection, pagination (offset and cursor), locale selection, and relation population depth.

#### Scenario: Filter and populate
- **WHEN** a client requests published articles where `category` equals `news`, sorted by date descending, with `author` populated
- **THEN** only matching entries are returned in that order with the author object embedded

### Requirement: Typed server and client helpers
The system SHALL provide query helpers for server code and app code whose inputs and results are typed from the generated schema types.

#### Scenario: Type error on unknown field
- **WHEN** app code filters `articles` by a field that does not exist
- **THEN** TypeScript reports a type error

### Requirement: Published-only by default
Public reads SHALL return only published content; drafts and unpublished revisions SHALL be returned only to callers with preview permission and an explicit draft/preview flag.

#### Scenario: Anonymous draft request
- **WHEN** an anonymous client requests an entry with the draft flag set
- **THEN** the published version is returned, or not-found if none is published

### Requirement: Permission enforcement
Every endpoint SHALL enforce access-control rules on the server for each operation and SHALL exclude fields the caller may not read.

#### Scenario: Restricted field
- **WHEN** a caller without permission to read the `internalNotes` field fetches an entry
- **THEN** the response omits `internalNotes`

### Requirement: Structured errors
API errors SHALL use consistent HTTP status codes and a stable JSON error shape with a machine-readable code, message, and per-field details for validation failures.

#### Scenario: Validation error shape
- **WHEN** a write fails validation on two fields
- **THEN** the response is 422 with an error code and a list containing both field paths and reasons

### Requirement: API tokens
Administrators SHALL be able to create scoped API tokens (read-only or with specific permissions, optional expiry) for headless/external consumers; tokens SHALL be stored hashed and be revocable.

#### Scenario: Revoked token
- **WHEN** a request uses a revoked token
- **THEN** it is rejected with 401

### Requirement: Rate limiting
Authentication and write endpoints SHALL be rate limited with configurable limits.

#### Scenario: Login brute force
- **WHEN** a client exceeds the configured failed-login attempts in the window
- **THEN** further attempts receive 429 until the window resets

### Requirement: Machine-readable API description
The system SHALL generate an OpenAPI description reflecting the app's collections and fields.

#### Scenario: OpenAPI document
- **WHEN** an administrator requests the API description endpoint
- **THEN** it returns an OpenAPI document listing endpoints and schemas for every collection
