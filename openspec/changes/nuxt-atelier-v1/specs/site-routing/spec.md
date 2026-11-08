# Spec Delta

## Purpose

Maps URLs to CMS-managed entries so editors can create pages without code changes, while host-defined pages keep priority, and manages redirects.

## ADDED Requirements

### Requirement: Routable content types
Collections and singletons SHALL be declarable as routable with a URL pattern (e.g. `/blog/{slug}`) and an optional page component or layout per type.

#### Scenario: New page without code
- **WHEN** an editor publishes a page with slug `about` in a routable `pages` collection mapped to `/{slug}`
- **THEN** `/about` renders that page using the configured component and layout

#### Scenario: Localized URL pattern
- **WHEN** a localized `projects` collection declares the pattern `/projects/{slug}` for English and `/projektid/{slug}` for Estonian
- **THEN** the Estonian translation is served at `/projektid/<slug>` and the English one at `/projects/<slug>`

### Requirement: Host routes take precedence
CMS-resolved routes SHALL only handle paths not matched by the host app's own pages.

#### Scenario: Conflicting path
- **WHEN** the host app defines `pages/contact.vue` and the CMS has an entry at `/contact`
- **THEN** the host page renders and the admin warns that the entry's path is shadowed

### Requirement: Unique and hierarchical paths
Paths SHALL be unique per locale, support parent/child hierarchy, and be updated for descendants when a parent slug changes.

#### Scenario: Parent slug change
- **WHEN** parent page `/services` is renamed to `/what-we-do`
- **THEN** child `/services/design` becomes `/what-we-do/design` and a redirect from the old path is offered or created per configuration

### Requirement: Not found handling
Requests for unpublished or nonexistent CMS paths SHALL return a 404 status using the host app's error page.

#### Scenario: Unpublished path
- **WHEN** an anonymous visitor requests the path of an unpublished entry
- **THEN** the response status is 404

### Requirement: Redirects manager
Administrators SHALL manage redirects (source path or pattern, target, 301/302/307/308) in the admin, evaluated on the server before page rendering, with loop detection.

#### Scenario: Redirect loop
- **WHEN** an administrator creates a redirect that would form a loop with an existing redirect
- **THEN** saving is refused with an explanation

### Requirement: Internal links survive renames
Link fields and rich-text links to entries SHALL reference entries by id and resolve to the current path at render time.

#### Scenario: Linked page renamed
- **WHEN** a page linked from another page's rich text is renamed
- **THEN** the link renders the new path without editing the linking page

### Requirement: Entry data access in host components
The host app SHALL be able to resolve the current route's entry and use it in its own pages and layouts via a composable.

#### Scenario: Custom layout reads entry
- **WHEN** a host layout calls the route-entry composable on a CMS page
- **THEN** it receives the typed entry data for that route
