# Spec Delta

## Purpose

Lets editors build public-facing forms (contact, signup, surveys) that visitors submit on the site, with safe storage, spam protection, and notifications.

## ADDED Requirements

### Requirement: Form definitions
Editors with permission SHALL create forms in the admin with fields (text, email, textarea, number, select, checkbox, radio, date, file, hidden, consent), per-field validation, labels per locale, and a success message or redirect.

#### Scenario: Create contact form
- **WHEN** an editor creates a form with required name, email, and message fields
- **THEN** the form is available to place on pages and enforces those rules

### Requirement: Form block rendering
Forms SHALL be placeable on pages via a form block, rendered with accessible markup, client-side validation, and server-side validation using the same rules, and SHALL be restylable or replaceable by the host app.

#### Scenario: Server rejects bypass
- **WHEN** a submission bypasses client validation and omits a required field
- **THEN** the server rejects it with field errors and nothing is stored

### Requirement: Submissions storage
Valid submissions SHALL be stored with timestamp, form version, and locale, viewable, filterable, and exportable (CSV/JSON) in the admin by permitted users, with a configurable retention period after which they are deleted.

#### Scenario: Retention
- **WHEN** submissions are older than the form's 90-day retention setting
- **THEN** they are deleted by a scheduled job

### Requirement: Spam and abuse protection
Form endpoints SHALL apply rate limiting, a honeypot, a minimum fill time, and optional pluggable challenge providers.

#### Scenario: Honeypot filled
- **WHEN** a submission fills the hidden honeypot field
- **THEN** it is discarded and the response appears successful to the sender

### Requirement: File uploads in forms
File fields SHALL enforce allowed types and size, store files privately (never publicly addressable), and expose them only to permitted admin users.

#### Scenario: Private file
- **WHEN** an anonymous user requests the URL of a file uploaded through a form
- **THEN** access is denied

### Requirement: Notifications and integrations
Forms SHALL support email notifications to configured recipients, an optional confirmation email to the submitter, and emitting submission events to hooks and webhooks.

#### Scenario: Notify
- **WHEN** a valid submission is received on a form with notifications enabled
- **THEN** the configured recipients receive an email via the job queue

### Requirement: Privacy
Forms SHALL support consent fields, and administrators SHALL be able to find and delete all submissions matching an email address.

#### Scenario: Erasure request
- **WHEN** an administrator deletes submissions for `jane@example.com`
- **THEN** all matching submissions and their files are permanently removed
