# Spec Delta

## Purpose

Lets multiple editors work on the same site without overwriting each other and discuss content in context through comments and edit locks.

## ADDED Requirements

### Requirement: Edit locking
Opening an entry for editing SHALL acquire an edit lock that other users see; the lock SHALL expire after a configurable inactivity timeout and be renewed while the editor is active.

#### Scenario: Locked entry
- **WHEN** user B opens an entry user A is actively editing
- **THEN** user B sees who holds the lock and the entry opens read-only for B

#### Scenario: Abandoned lock
- **WHEN** user A closes the browser without saving and the inactivity timeout elapses
- **THEN** the lock is released and others can edit

### Requirement: Take over lock
Users with sufficient permission SHALL be able to take over a lock; the previous holder SHALL be notified and their unsaved changes SHALL be preserved as a recoverable draft.

#### Scenario: Takeover
- **WHEN** an administrator takes over user A's lock
- **THEN** user A's editor switches to read-only with a notice, and A's unsaved changes are kept as a recoverable draft

### Requirement: Presence
The admin SHALL show which users currently have an entry open.

#### Scenario: Presence indicator
- **WHEN** two users have the same entry open
- **THEN** each sees the other's avatar on that entry

### Requirement: Real-time updates
Lock, presence, comment, and notification changes SHALL be pushed to open admin sessions over WebSocket where the platform supports it, and SHALL fall back to polling otherwise, with the same resulting state either way.

#### Scenario: Pushed lock change
- **WHEN** the WebSocket transport is active and user A acquires a lock on an entry user B has open
- **THEN** user B's view shows the lock within 2 seconds

#### Scenario: Polling fallback
- **WHEN** WebSocket is unavailable on the platform or the connection fails
- **THEN** the same lock and presence changes appear within the configured polling interval

#### Scenario: Cross-site WebSocket rejected
- **WHEN** a page on another origin opens a WebSocket to the real-time endpoint carrying a user's session cookie
- **THEN** the upgrade is refused

### Requirement: Block and entry comments
Users with review permission SHALL be able to comment on an entry or a specific block, reply in threads, mention users, and resolve threads; comments SHALL not be part of published content.

#### Scenario: Comment on block
- **WHEN** a reviewer comments on a block in the visual editor
- **THEN** the comment marker appears on that block in the preview and in the comments panel

#### Scenario: Block deleted
- **WHEN** a block with open comments is deleted
- **THEN** its comments remain visible on the entry, marked as referring to a removed block

### Requirement: Notifications
Users SHALL be notified in the admin of mentions, replies to their threads, and lock takeovers, with optional email delivery when email is configured.

#### Scenario: Mention notification
- **WHEN** a user is mentioned in a comment
- **THEN** they see an unread notification linking to the comment
