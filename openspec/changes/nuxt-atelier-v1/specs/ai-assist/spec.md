# Spec Delta

## Purpose

Offers optional AI assistance to editors (alt text, translation, SEO and writing suggestions) through a provider-agnostic adapter, disabled by default and never acting without editor review.

## ADDED Requirements

### Requirement: Disabled by default
AI features SHALL be disabled unless an AI provider adapter is configured, and when disabled no AI UI, network calls, or AI dependencies SHALL be loaded.

#### Scenario: Not configured
- **WHEN** no AI provider is configured
- **THEN** no AI actions appear in the admin and the admin bundle contains no AI provider code

### Requirement: Provider adapter
AI features SHALL use a provider adapter interface so any compatible provider can be used, with credentials only on the server and never exposed to the browser.

#### Scenario: Server-side credentials
- **WHEN** an editor triggers an AI action
- **THEN** the request goes through a CMS server endpoint and the provider API key never appears in client responses or bundles

### Requirement: Assist actions
When enabled, the system SHALL offer: image alt text generation, field and block translation into another locale, SEO title/description suggestions, and rewrite/shorten/expand for text fields.

#### Scenario: Translate block
- **WHEN** an editor uses the translate action on a block into French
- **THEN** a French suggestion is shown for review before replacing content

### Requirement: Human review
AI output SHALL always be presented as a suggestion the editor accepts, edits, or discards; it SHALL never be saved or published automatically, and accepted changes SHALL be undoable.

#### Scenario: Discard suggestion
- **WHEN** an editor discards an AI suggestion
- **THEN** the field content is unchanged

### Requirement: Permissions, limits, and privacy
AI actions SHALL require a dedicated permission, be subject to per-user rate and usage limits, and allow administrators to exclude content types or fields from being sent to the provider.

#### Scenario: Excluded field
- **WHEN** a field is marked as excluded from AI processing
- **THEN** its content is never included in any AI provider request

### Requirement: Usage audit
AI requests SHALL be recorded with user, action, time, and token or cost usage when the provider reports it.

#### Scenario: Usage report
- **WHEN** an administrator views AI usage
- **THEN** they see requests per user and action for a chosen period
