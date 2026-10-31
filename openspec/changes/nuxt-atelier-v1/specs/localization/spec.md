# Spec Delta

## Purpose

Stores and edits content per locale inside the CMS and integrates with the host app's i18n module for localized routing and interface strings through an adapter.

## ADDED Requirements

### Requirement: Locale configuration
The system SHALL support configuring a list of content locales and a default locale; with a single locale, all localization UI SHALL be hidden.

#### Scenario: Single locale
- **WHEN** only one locale is configured
- **THEN** no locale switchers or translation UI appear in the admin

### Requirement: Localized fields and entries
Content types SHALL be declarable as localized, with per-field control over whether a field is translated or shared across locales.

#### Scenario: Shared field
- **WHEN** a localized collection marks `sku` as shared and an editor changes it in German
- **THEN** the `sku` value is updated for all locales

### Requirement: Translation linking
Localized entries SHALL be linked as translations of each other, and the admin SHALL show translation status per locale and allow creating a translation from an existing locale.

#### Scenario: Create translation
- **WHEN** an editor creates the French translation of an English page
- **THEN** a French draft is created prefilled with the English content and linked to it

### Requirement: Locale fallback
Reads SHALL support a configurable fallback chain when content is missing in the requested locale.

#### Scenario: Missing translation
- **WHEN** a German entry lacks a translated `subtitle` and the fallback chain is German → English
- **THEN** the English `subtitle` is returned and the response indicates the fallback

### Requirement: Localized blocks
Block content SHALL be localizable either per locale (independent block trees) or per field (shared structure, translated fields), chosen per content type.

#### Scenario: Shared structure
- **WHEN** a content type uses shared block structure and an editor reorders blocks in English
- **THEN** the block order changes for all locales while translated text stays per locale

### Requirement: i18n module adapter
Localized routing and interface strings SHALL integrate through an i18n adapter; official adapters SHALL exist for nuxt-i18n-micro (default when installed) and @nuxtjs/i18n, and the CMS SHALL work without any i18n module.

#### Scenario: Default adapter
- **WHEN** the host app has nuxt-i18n-micro installed and no adapter is configured
- **THEN** the CMS uses its locales and route strategy for localized routes

#### Scenario: No i18n module
- **WHEN** neither i18n module is installed and multiple content locales are configured
- **THEN** localized content is available via API and query helpers by explicit locale

### Requirement: Admin interface language
The admin UI SHALL be translatable, ship with English, and allow additional admin languages to be added by the host app or plugins, independent of content locales.

#### Scenario: Admin in German
- **WHEN** a user selects German as their admin language and a German admin translation is installed
- **THEN** admin chrome is displayed in German regardless of the content locale being edited
