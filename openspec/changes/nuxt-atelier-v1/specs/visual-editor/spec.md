# Spec Delta

## Purpose

Provides WYSIWYG page building by rendering the host site's real routes and components in an isolated preview frame that the admin controls through a typed message bridge.

## ADDED Requirements

### Requirement: Iframe preview of real routes
The editor SHALL render the entry being edited using the host app's actual route, layout, and block components inside an iframe, showing the unsaved edit state.

#### Scenario: Unsaved edit visible
- **WHEN** an editor changes a block's title field without saving
- **THEN** the preview frame shows the new title rendered by the real block component within the configured debounce interval (default ≤150 ms)

### Requirement: Secure bridge
Communication between admin and preview SHALL use a versioned, typed message protocol that validates message origin and shape, and the preview SHALL only enter edit mode with a valid, short-lived preview token for an authorized user.

#### Scenario: Foreign origin message
- **WHEN** a message from an origin other than the configured admin origin reaches the preview
- **THEN** it is ignored and no state changes

#### Scenario: Edit mode without token
- **WHEN** a visitor opens a page with an edit-mode query parameter but no valid token
- **THEN** the page renders as public, published content

### Requirement: Selection and hover mapping
The editor SHALL map rendered DOM to blocks so editors can hover and click blocks in the preview to select them, with the selection synchronized to the admin's structure tree and form panel.

#### Scenario: Click to select
- **WHEN** an editor clicks inside a rendered block in the preview
- **THEN** that block is highlighted, selected in the structure tree, and its fields open in the side panel

### Requirement: Add, move, duplicate, delete
Editors SHALL be able to add blocks from a picker, reorder and move blocks between allowed areas by drag and drop (in preview and structure tree), duplicate, and delete them, respecting placement rules.

#### Scenario: Drag into disallowed area
- **WHEN** an editor drags a block over an area that does not allow it
- **THEN** the drop target is shown as invalid and the drop is rejected

### Requirement: Inline editing
Text and rich-text fields marked inline-editable SHALL be editable directly in the preview, with changes synchronized to the admin form.

#### Scenario: Inline rich text
- **WHEN** an editor double-clicks an inline-editable rich-text region and types
- **THEN** the text updates in place and the corresponding admin field reflects the change

### Requirement: Undo and redo
The editor SHALL keep an ordered history of edit operations for the session with undo/redo via toolbar and keyboard shortcuts.

#### Scenario: Undo move
- **WHEN** an editor moves a block and presses the undo shortcut
- **THEN** the block returns to its previous position in preview and structure tree

### Requirement: Responsive preview
The editor SHALL let editors switch the preview frame between configurable viewport presets and a custom width.

#### Scenario: Mobile preset
- **WHEN** an editor selects the mobile preset
- **THEN** the iframe viewport width changes so the site's responsive CSS applies

### Requirement: Proxy editing mode
Blocks whose rendered DOM cannot support direct manipulation (e.g. sliders, carousels) SHALL be editable through a proxy view listing their child items, declared per block.

#### Scenario: Carousel items
- **WHEN** an editor selects a carousel block declared as proxy-edited
- **THEN** its slides are listed in a reorderable proxy panel instead of requiring DOM drag-and-drop

### Requirement: Style isolation
Admin and editor chrome styles SHALL NOT affect site rendering in the preview, and site styles SHALL NOT affect admin chrome, without disabling or removing any stylesheet at runtime.

#### Scenario: Conflicting global CSS
- **WHEN** the site defines aggressive global styles (e.g. `* { box-sizing: content-box }`, `button { all: unset }`)
- **THEN** admin chrome renders correctly and the preview renders the site exactly as public visitors see it

### Requirement: Keyboard and command palette
The editor SHALL provide keyboard shortcuts for common actions and a searchable command palette, both extensible by plugins.

#### Scenario: Command palette
- **WHEN** an editor opens the command palette and types "add hero"
- **THEN** an action to insert the Hero block is offered and executes on selection

### Requirement: Accessible editor
Editor chrome SHALL be keyboard-operable and meet WCAG 2.2 AA for its own UI, including moving blocks without a pointer.

#### Scenario: Keyboard move
- **WHEN** an editor selects a block in the structure tree and uses the move-down keyboard action
- **THEN** the block moves down one position and the change is announced to assistive technology
