# Spec Delta

## Purpose

Lets developers build pages from blocks that are ordinary Vue components of the host app, with schemas the server can validate and the editor can edit, regardless of UI library.

## ADDED Requirements

### Requirement: In-component block definition
A Vue single-file component in a block directory SHALL become a block when it declares block metadata with a define-block macro and its editable fields via field helpers in its props declaration.

#### Scenario: Macro block
- **WHEN** a developer creates a `Hero.vue` block declaring block metadata and `title` and `image` fields in its props
- **THEN** `Hero` appears in the editor's block picker and its fields are editable

### Requirement: Separate schema file definition
A block SHALL alternatively be defined by a separate schema file that references any Vue component, including components from third-party packages.

#### Scenario: Third-party component as block
- **WHEN** a schema file declares a block whose component is imported from a UI library package
- **THEN** the block is available and edited identically to an in-component block

### Requirement: Static schema extraction
Block schemas SHALL be extracted at build time by static analysis without executing component code; definitions that cannot be statically analyzed SHALL fail the build with an error pointing to the file and line.

#### Scenario: Non-static definition
- **WHEN** a block's metadata references a runtime variable that cannot be resolved statically
- **THEN** the build fails with a message identifying the file, line, and the unsupported expression

### Requirement: Block discovery across layers
Blocks SHALL be discovered from the app and every Nuxt layer, and a block in a higher-priority layer or the app SHALL override a same-named block from a lower-priority layer without error.

#### Scenario: Layer override
- **WHEN** a layer defines block `Hero` and the app also defines block `Hero`
- **THEN** the app's `Hero` is used everywhere and the build succeeds

### Requirement: Nested blocks and placement rules
Blocks SHALL support nested block areas, each with allow/deny rules by block name, group, or tag, and min/max item counts, enforced both in the editor and on the server.

#### Scenario: Disallowed nesting via API
- **WHEN** an API write places a block in an area whose rules do not allow it
- **THEN** the server rejects the write with a validation error naming the area and block

### Requirement: Block options
Blocks SHALL support presentation options (e.g. variant, spacing, theme) declared alongside fields, stored with the block, and passed to the component as props.

#### Scenario: Option change
- **WHEN** an editor changes a block's `variant` option
- **THEN** the component receives the new option value and re-renders

### Requirement: UI-library agnostic rendering
Block components SHALL NOT be required to import, extend, or wrap any nuxt-atelier component or style, and SHALL render the same whether styled with Nuxt UI, shadcn-vue, Tailwind, or plain CSS.

#### Scenario: Plain CSS block
- **WHEN** a block uses only scoped CSS and no UI library
- **THEN** it renders and is fully editable in the visual editor

### Requirement: Block area rendering component
The system SHALL provide a rendering component that renders a stored list of blocks with their nested areas and supports a per-block fallback for unknown block types.

#### Scenario: Unknown block type in production
- **WHEN** stored content contains a block type no longer defined
- **THEN** public rendering skips it without crashing and logs a warning, and the admin shows it as an unknown block that can be removed

### Requirement: Area context for nested blocks
The system SHALL let a block rendered in another block's area read the props that block passes to the area's slot, the area's name, the block it belongs to and the enclosing areas, without passing slot props as the nested block's props or attributes.

#### Scenario: Slot props reach a nested block
- **WHEN** a Columns block renders `<slot name="left" side="start" />` and a Card sits in its `left` area
- **THEN** the Card reads `side` as `"start"` from its area, along with the Columns block's id and any area around that Columns block, and no `side` attribute is rendered

### Requirement: Schema reconciliation
When block or field schemas change, the system SHALL detect stored data that no longer matches, keep it readable and repairable in the admin, and SHALL NOT block saving unrelated changes because of stale fields.

#### Scenario: Removed field
- **WHEN** a field is removed from a block that has stored values for it
- **THEN** the entry still loads and saves, and the admin reports the orphaned data with options to drop or migrate it

#### Scenario: Added nested area
- **WHEN** a nested block area is added to an existing block type
- **THEN** existing instances load with that area empty and the editor works without errors

### Requirement: Editor-only code isolation
Code used only for editing SHALL NOT be included in the JavaScript delivered to public visitors.

#### Scenario: Public bundle
- **WHEN** the production build is analyzed
- **THEN** chunks loaded by a public page do not contain editor or admin modules
