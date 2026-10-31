# Spec Delta

## Purpose

Lets developers extend and integrate the CMS through typed lifecycle hooks, background jobs, outgoing webhooks, and installable plugins without forking.

## ADDED Requirements

### Requirement: Content lifecycle hooks
The system SHALL provide typed server hooks before and after create, update, delete, publish, unpublish, and read, where before-hooks can modify data or abort with an error.

#### Scenario: Abort on validation hook
- **WHEN** a before-create hook throws a validation error for an article
- **THEN** the article is not created and the client receives the hook's error

#### Scenario: Hook failure isolation
- **WHEN** an after-publish hook throws
- **THEN** the publish remains committed, the error is logged, and the hook failure is reported in the admin

### Requirement: Background jobs
The system SHALL provide a persistent job queue with retries, exponential backoff, a maximum attempts limit, concurrency limits, and scheduled/recurring jobs. Due jobs SHALL be run by the platform's native scheduler where the server engine supports one, and otherwise via an authenticated trigger endpoint for an external scheduler.

#### Scenario: Native platform scheduler
- **WHEN** the site is deployed to a platform with native scheduled-task support (e.g. Node server, Vercel, Cloudflare Workers) and a job becomes due
- **THEN** the job runs without any external scheduler being configured

#### Scenario: Retry then fail
- **WHEN** a job fails on every attempt up to its max attempts
- **THEN** it is marked failed with the last error and is visible and retryable in the admin

#### Scenario: Serverless trigger
- **WHEN** an external scheduler calls the job trigger endpoint with the configured secret
- **THEN** due jobs are processed within the request's time budget and remaining jobs stay queued

### Requirement: Outgoing webhooks
Administrators SHALL configure webhooks for content events with a target URL, event filter, and secret; deliveries SHALL be signed, sent via the job queue with retries, and logged.

#### Scenario: Signed delivery
- **WHEN** an article is published and a webhook subscribes to publish events
- **THEN** the target receives a POST with the event payload and a signature header verifiable with the secret

#### Scenario: Internal address blocked
- **WHEN** an administrator configures a webhook URL that resolves to a private or loopback address and that is not explicitly allowlisted
- **THEN** delivery is refused to prevent server-side request forgery

### Requirement: Plugins
Plugins SHALL be distributable as Nuxt layers or modules that can add collections, fields, blocks, hooks, jobs, admin pages, editor features, and translations through documented APIs.

#### Scenario: Install plugin
- **WHEN** a developer adds a plugin package that contributes a custom field and an admin page
- **THEN** the field is usable in schemas and the page appears in the admin navigation

### Requirement: Editor and admin extension points
The editor and admin SHALL expose documented extension points (toolbar actions, block actions, sidebar panels, context menu items, commands, dashboard widgets) that plugins and the host app can register.

#### Scenario: Custom block action
- **WHEN** a plugin registers a block action "Translate block"
- **THEN** the action appears in the block's action menu in the visual editor

### Requirement: CLI
The system SHALL provide a CLI for project setup, migration generate/apply/status, user management (create admin, reset password), content export/import, and job processing.

#### Scenario: Reset admin password
- **WHEN** an operator runs the reset-password command for a user on the server
- **THEN** the user's password is reset and their existing sessions are invalidated
