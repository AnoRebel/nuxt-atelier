# Spec Delta

## Purpose

Keeps the CMS lean, fast, safe, and resource-bounded in production through enforced performance budgets, bounded resource usage, secure defaults, and operational health signals.

## ADDED Requirements

### Requirement: Public page weight budget
The CMS SHALL add no more than 15 KB (gzip) of JavaScript to a public CMS-rendered page beyond the host's own components, enforced in CI.

#### Scenario: Budget exceeded
- **WHEN** a change increases CMS runtime JavaScript on the reference public page above the budget
- **THEN** the CI size check fails and reports the delta

### Requirement: Server response budget
On reference hardware defined in the docs, rendering a cached published CMS page SHALL have p95 server time ≤ 50 ms, and an uncached page with 50 blocks ≤ 200 ms, measured by a CI benchmark that fails on >10% regression.

#### Scenario: Regression detected
- **WHEN** the benchmark p95 for uncached rendering regresses by more than 10% against the baseline
- **THEN** the CI benchmark job fails

### Requirement: Query efficiency
Loading an entry with nested blocks and populated relations SHALL use a bounded number of database queries independent of block count (no N+1), verified by tests.

#### Scenario: Many blocks
- **WHEN** an entry with 200 blocks and 20 relations is loaded
- **THEN** the number of queries does not exceed the documented bound

### Requirement: Bounded resources
All server operations SHALL have explicit limits: request body size, upload size, query page size (max), relation depth, nesting depth, job concurrency, database pool size, and in-memory cache size, each configurable with safe defaults.

#### Scenario: Oversized page size
- **WHEN** a client requests a page size above the configured maximum
- **THEN** the response is capped at the maximum and indicates the applied limit

#### Scenario: Deep nesting
- **WHEN** a write contains blocks nested beyond the maximum depth
- **THEN** it is rejected with a validation error

### Requirement: Streaming large transfers
Uploads, downloads, exports, and imports SHALL stream rather than buffer entire files in memory.

#### Scenario: Large export
- **WHEN** an export of 1 GB of content and media metadata runs
- **THEN** server memory stays within the documented ceiling for the process

### Requirement: Caching
The system SHALL provide configurable caching of published content and rendered CMS routes with correct invalidation, and SHALL never cache responses for authenticated or preview requests in shared caches.

#### Scenario: Preview not cached
- **WHEN** an editor views a draft in preview mode
- **THEN** the response carries headers preventing shared caching and is not stored in the CMS route cache

### Requirement: Secure defaults
The system SHALL ship secure defaults: strict security headers on admin routes (including a content security policy and frame restrictions allowing only the admin to frame preview), sanitized rich text output, output encoding, parameterized queries only, and secrets required in production.

#### Scenario: Missing secret in production
- **WHEN** the app starts in production without a session secret configured
- **THEN** startup fails with an error explaining how to set it

#### Scenario: Stored XSS attempt
- **WHEN** an editor saves rich text containing a script tag or event-handler attribute
- **THEN** the dangerous markup is removed before storage and never rendered

### Requirement: Dependency hygiene
Every runtime dependency SHALL be justified in documentation, optional features SHALL be loaded only when enabled, and CI SHALL fail on known high or critical vulnerabilities and on unused dependencies.

#### Scenario: Unused dependency
- **WHEN** a package lists a runtime dependency not imported by its code
- **THEN** the CI dependency check fails

### Requirement: Health and readiness
The system SHALL expose liveness and readiness endpoints reporting database connectivity, pending migrations, storage availability, and job queue state without leaking secrets.

#### Scenario: Database down
- **WHEN** the database becomes unreachable
- **THEN** the readiness endpoint returns 503 while liveness returns 200

### Requirement: Structured logging and observability
The system SHALL emit structured logs with levels and request correlation ids, and SHALL never log secrets, passwords, tokens, or form submission contents.

#### Scenario: Login failure log
- **WHEN** a login fails
- **THEN** a structured log entry with a correlation id is written and the submitted password is not included

### Requirement: Graceful shutdown
On shutdown signals, the server SHALL stop accepting new jobs, finish or safely requeue running jobs within a timeout, and close database connections.

#### Scenario: Shutdown during job
- **WHEN** the process receives a termination signal while a job is running
- **THEN** the job completes within the timeout or is requeued without being marked failed
