# Spec Delta

## Purpose

Gives editors control over search and social metadata for routable content and generates sitemap and robots output that reflects only public, published content.

## ADDED Requirements

### Requirement: Per-entry SEO fields
Routable content types SHALL include SEO fields (title, description, canonical URL, robots directives, Open Graph/Twitter title, description, image) with sensible fallbacks from entry content and site defaults.

#### Scenario: Fallback title
- **WHEN** an entry has no SEO title
- **THEN** the rendered page title uses the entry title combined with the site title template

### Requirement: Head output
CMS-rendered routes SHALL server-render the resolved meta tags, canonical link, and Open Graph tags in the HTML head.

#### Scenario: SSR meta
- **WHEN** a crawler fetches a published CMS page without executing JavaScript
- **THEN** the HTML contains the title, description, canonical, and Open Graph tags

### Requirement: Localized alternates
For localized entries, pages SHALL output alternate-language links for every published translation.

#### Scenario: hreflang
- **WHEN** a page is published in English and German
- **THEN** both versions include alternate links for `en` and `de`

### Requirement: Structured data
The system SHALL support site-level and per-type structured data (JSON-LD) mapped from entry fields.

#### Scenario: Article schema
- **WHEN** a blog collection is configured to emit Article structured data
- **THEN** each published post's page includes Article JSON-LD with headline, author, and dates

### Requirement: Sitemap
The system SHALL generate a sitemap containing only published, indexable, routable entries with last-modified dates and locale alternates, integrating with an existing sitemap module when present.

#### Scenario: Noindex excluded
- **WHEN** an entry is published with robots set to noindex
- **THEN** it does not appear in the sitemap

### Requirement: Robots
The system SHALL serve robots directives configurable in the admin, always disallowing the admin and API base paths.

#### Scenario: Admin disallowed
- **WHEN** the robots file is requested
- **THEN** it disallows the admin route and CMS API base path

### Requirement: SEO preview and checks
The admin SHALL show search-result and social-card previews and non-blocking checks (missing description, title length, missing alt text, duplicate titles).

#### Scenario: Missing description
- **WHEN** an editor opens the SEO panel of an entry without a description
- **THEN** a warning is shown and saving is still allowed
