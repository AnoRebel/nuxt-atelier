# Spec Delta

## Purpose

Lets editors reuse content across pages: globally shared blocks that update everywhere, and templates/patterns that copy a starting structure.

## ADDED Requirements

### Requirement: Shared (global) blocks
Editors SHALL be able to save a block (with nested children) as a shared block and insert references to it on many pages; editing the shared block SHALL update every page that references it once published.

#### Scenario: Update shared footer CTA
- **WHEN** an editor edits and publishes a shared CTA block used on 20 pages
- **THEN** all 20 pages render the updated CTA without editing each page

### Requirement: Detach shared block
Editors SHALL be able to detach a shared block reference, converting it into an independent local copy on that page only.

#### Scenario: Detach
- **WHEN** an editor detaches a shared block on one page and edits it
- **THEN** only that page changes and the shared block is unaffected

### Requirement: Shared block usage and delete protection
The system SHALL list where each shared block is used and SHALL prevent deleting an in-use shared block unless the editor chooses to detach or remove all references.

#### Scenario: Delete in use
- **WHEN** an editor deletes a shared block used on 3 pages
- **THEN** they must choose to detach copies into those pages or remove the references before deletion completes

### Requirement: Patterns
Developers and editors SHALL be able to define patterns: predefined block arrangements inserted as independent copies.

#### Scenario: Insert pattern
- **WHEN** an editor inserts the "Pricing section" pattern
- **THEN** its blocks are added as normal editable blocks with no link back to the pattern

### Requirement: Entry templates
Content types SHALL support templates used to prefill new entries, definable in code by developers or saved from existing entries by editors.

#### Scenario: New page from template
- **WHEN** an editor creates a page from the "Landing page" template
- **THEN** the new draft contains the template's blocks and field values

### Requirement: Clipboard copy and paste
Editors SHALL be able to copy blocks and paste them into another area or another entry, including across browser tabs, subject to placement rules.

#### Scenario: Cross-entry paste
- **WHEN** an editor copies a block from page A and pastes into an allowed area on page B
- **THEN** a new independent copy with fresh ids is inserted on page B
