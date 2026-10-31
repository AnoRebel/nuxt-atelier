# Spec Delta

## Purpose

Provides the content management interface as an optional package: headless admin logic with a default, fully themeable Nuxt UI kit, mounted inside the host app without leaking styles either way.

## ADDED Requirements

### Requirement: Optional admin package
The admin SHALL be a separately installable package; without it, schemas, API, rendering, and adapters SHALL work fully (headless mode).

#### Scenario: Headless install
- **WHEN** the core module is installed without the admin package
- **THEN** no admin route or admin assets are added and the content API works

### Requirement: Configurable mount route
The admin SHALL be mounted at a configurable base route (default `/admin`), rendered client-side only, and excluded from prerendering, sitemaps, and search indexing.

#### Scenario: Custom base
- **WHEN** the admin base route is configured as `/studio`
- **THEN** the admin is served at `/studio` and `/admin` is not handled by the CMS

### Requirement: Headless admin layer
All admin behavior (data loading, forms, validation, list state, permissions, navigation) SHALL be exposed as documented composables independent of any UI kit, so alternative kits can be built against the same contract.

#### Scenario: Custom kit
- **WHEN** a developer builds an edit view using only the headless composables and their own components
- **THEN** loading, validating, and saving entries behaves identically to the default kit

### Requirement: Default Nuxt UI kit
The default admin UI SHALL be built with Nuxt UI and SHALL install its UI dependencies without requiring the host site to use Nuxt UI or Tailwind for its own pages.

#### Scenario: Site without Tailwind
- **WHEN** the host site uses plain CSS and no Tailwind
- **THEN** the admin renders correctly and no admin CSS is applied to public pages

### Requirement: Theming
The admin SHALL be themeable through design tokens (colors, radius, fonts, density), light/dark mode, and branding (logo, name, favicon) via app configuration, without rebuilding the admin package.

#### Scenario: Brand color
- **WHEN** the app configuration sets the admin primary color to a custom value
- **THEN** admin buttons, links, and focus rings use that color

### Requirement: Component overrides
Every admin view and field input SHALL be overridable by name from the host app or a layer, falling back to the default when not overridden.

#### Scenario: Override field input
- **WHEN** the host app provides an override for the date field input
- **THEN** all date fields in the admin use the override

### Requirement: Custom admin pages and navigation
Host apps and plugins SHALL be able to add admin pages with navigation entries, icons, ordering, and required permissions.

#### Scenario: Permission-gated page
- **WHEN** a custom admin page requires `manage-settings` and a user lacks it
- **THEN** the page is hidden from navigation and direct access returns a forbidden view

### Requirement: Collection views
The admin SHALL provide list views with search, filters, sortable columns, column selection, bulk actions (publish, unpublish, delete, export), and pagination, plus edit views generated from schemas.

#### Scenario: Bulk publish
- **WHEN** an editor selects 10 drafts and runs bulk publish
- **THEN** all 10 permitted entries are published and any failures are reported per entry

### Requirement: Dashboard home
The admin home SHALL show recent activity, the user's drafts, scheduled items, failed jobs, and pending migrations warnings, extensible with widgets.

#### Scenario: Failed jobs visible
- **WHEN** a webhook delivery job has failed
- **THEN** administrators see it in a dashboard widget with a link to retry

### Requirement: Unsaved changes protection
The admin SHALL warn before navigation or closing when there are unsaved changes and SHALL autosave local recovery copies.

#### Scenario: Browser crash recovery
- **WHEN** the browser closes unexpectedly with unsaved edits and the user reopens the entry
- **THEN** they are offered to restore the recovered changes

### Requirement: Accessible and responsive admin
The admin SHALL meet WCAG 2.2 AA and be usable on tablet-sized screens for content editing.

#### Scenario: Automated accessibility check
- **WHEN** the automated accessibility suite runs against core admin views
- **THEN** no serious or critical violations are reported
