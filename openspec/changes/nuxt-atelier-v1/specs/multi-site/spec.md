# Spec Delta

## Purpose

Serves multiple sites or tenants from one deployment, each with its own domain, settings, and content scope, with strict isolation between tenants.

## ADDED Requirements

### Requirement: Single-site default
Multi-site SHALL be disabled by default, and with a single site no site-selection UI or site scoping SHALL be visible.

#### Scenario: Default install
- **WHEN** multi-site is not enabled
- **THEN** the admin and API behave as a single site with no site parameters

### Requirement: Site definitions
Administrators SHALL define sites with a name, one or more hostnames, default locale, enabled locales, and site-specific settings and singletons.

#### Scenario: Resolve site by host
- **WHEN** a request arrives for `shop.example.com` mapped to site `shop`
- **THEN** routes, singletons, and content resolve within site `shop`

#### Scenario: Unknown host
- **WHEN** a request arrives for a hostname not mapped to any site
- **THEN** it is served by the configured fallback site or rejected with 404 if none is configured

### Requirement: Content scoping
Content types SHALL be configurable as site-scoped (entries belong to one site) or shared (available to all sites), and site-scoped reads and writes SHALL never return or modify another site's entries.

#### Scenario: Cross-site isolation
- **WHEN** an API request in the context of site A requests an entry id belonging to site B
- **THEN** the response is not-found

### Requirement: Per-site access
User roles SHALL be assignable per site, and users SHALL only see and edit sites they have access to.

#### Scenario: Restricted editor
- **WHEN** an editor with access only to site A opens the admin
- **THEN** only site A appears and site B's content is inaccessible via admin and API

### Requirement: Per-site media and routing
Media libraries, redirects, sitemaps, robots, and search indexes SHALL be scoped per site, with optional shared media.

#### Scenario: Per-site sitemap
- **WHEN** the sitemap is requested on site A's hostname
- **THEN** it contains only site A's published routable entries

### Requirement: Tenant isolation in storage
Site scoping SHALL be enforced in the data access layer for every query, not only in the UI, and automated tests SHALL verify isolation for every endpoint.

#### Scenario: Isolation test suite
- **WHEN** the isolation test suite runs against all content, media, form, and search endpoints
- **THEN** no endpoint returns or modifies data from a different site
