# Spec Delta

## Purpose

Lets developers define content structure (collections, singletons, fields) in code as the single source of truth for storage, API validation, generated types, and admin forms.

## ADDED Requirements

### Requirement: Code-first collections
The system SHALL let developers define collections (multi-entry content types) in source files discovered by convention from the app and every Nuxt layer, with a unique name, fields, and options (routable, localized, versioned, labels, admin display).

#### Scenario: Collection discovered
- **WHEN** a developer adds a collection definition file for `articles` in the conventional directory
- **THEN** storage, API endpoints, admin list/edit views, and types for `articles` become available

#### Scenario: Layer collection
- **WHEN** a Nuxt layer used by the app defines a collection
- **THEN** that collection is registered as if defined in the app

### Requirement: Singletons
The system SHALL support singletons: content types with exactly one entry per locale (e.g. site settings, header, footer).

#### Scenario: Singleton access
- **WHEN** a singleton `settings` is defined and has never been edited
- **THEN** reading it returns an entry populated with field defaults rather than an error

### Requirement: Field types
The system SHALL provide built-in field types at minimum: text, textarea, rich text, number, boolean, select, multi-select, date/time, email, URL, slug, color, JSON, media, relation (one/many), object (nested group), repeater (array of objects), and blocks.

#### Scenario: Nested object and repeater
- **WHEN** a collection defines a repeater whose items contain an object field
- **THEN** entries store, validate, and edit that nested structure

### Requirement: Field validation
Each field SHALL support declarative validation (required, min/max, length, pattern, unique, custom validator), and the server SHALL enforce it on every write regardless of client.

#### Scenario: Server-side rejection
- **WHEN** an API write omits a required field
- **THEN** the write is rejected with a structured error listing each failing field path and reason, and nothing is stored

### Requirement: Field defaults are isolated
Default values SHALL be produced fresh for each entry or block so that object or array defaults are never shared by reference between entries.

#### Scenario: Array default
- **WHEN** two blocks with an array field default are added and one block's array is modified
- **THEN** the other block's array is unchanged

### Requirement: Custom field types
Developers SHALL be able to register custom field types providing a storage model, validation, and admin input component, usable exactly like built-in fields.

#### Scenario: Custom field
- **WHEN** a developer registers a `geo-point` field with an input component and validator
- **THEN** collections and blocks can use it and the admin renders the custom input

### Requirement: Relations
Relation fields SHALL reference entries of named collections, SHALL be resolvable to a configurable depth when queried, and SHALL define behavior when the referenced entry is deleted (block, nullify, or cascade).

#### Scenario: Delete with restrict
- **WHEN** an entry referenced by a relation configured to block deletion is deleted
- **THEN** the deletion is refused with an error listing the referencing entries

### Requirement: Two-way relations
A relation field SHALL be able to declare its inverse: a relation field on the target collection pointing back. Both sides SHALL stay in sync whichever side is edited, in the same transaction, and both SHALL read, filter and populate like any relation.

#### Scenario: Editing one side
- **WHEN** `books.authors` declares the inverse `authors.books` and an editor adds author A to book B
- **THEN** reading author A lists book B in `books`, and removing A from B's authors removes B from A's books

### Requirement: Schema identity
Fields SHALL have stable keys so renames can be declared explicitly, preserving existing data instead of treating a rename as drop-and-add.

#### Scenario: Declared rename
- **WHEN** a field is renamed with an explicit rename declaration
- **THEN** the generated migration renames the stored data and no content is lost
