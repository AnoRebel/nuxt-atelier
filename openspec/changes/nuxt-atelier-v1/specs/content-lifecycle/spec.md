# Spec Delta

## Purpose

Separates work-in-progress from live content and keeps a full, restorable history of every change, including scheduled publishing.

## ADDED Requirements

### Requirement: Draft and published states
Versioned content types SHALL keep a published version and an independent working draft; saving SHALL update only the draft until it is published.

#### Scenario: Save without publish
- **WHEN** an editor saves changes to a published page without publishing
- **THEN** public visitors still see the previously published version and the admin shows the entry as having unpublished changes

### Requirement: Publish and unpublish
Users with publish permission SHALL be able to publish the current draft, making it the live version atomically, and unpublish an entry so it is no longer publicly accessible.

#### Scenario: Unpublish
- **WHEN** an editor unpublishes a page
- **THEN** its public route returns not-found and the entry remains editable as a draft

### Requirement: Revision history
Every save and publish SHALL create an immutable revision recording author, timestamp, and content snapshot, retained per a configurable retention policy.

#### Scenario: History list
- **WHEN** an editor opens an entry's history
- **THEN** revisions are listed newest first with author, time, and whether each was published

### Requirement: Diff and restore
Users SHALL be able to compare any two revisions, including block-level additions, removals, moves, and field changes, and restore a revision as the new draft.

#### Scenario: Restore
- **WHEN** an editor restores a revision from last week
- **THEN** a new draft is created from that revision's content and the intervening revisions remain in history

### Requirement: Scheduled publishing
Users with publish permission SHALL be able to schedule publish and unpublish at a future date/time, executed by the job system even if no user is active.

#### Scenario: Scheduled publish fires
- **WHEN** a draft is scheduled to publish at 09:00 and the time passes
- **THEN** the draft becomes the live version within the configured job interval and an audit entry is recorded

#### Scenario: Schedule cancelled by edit
- **WHEN** an editor changes the scheduled content's draft after scheduling
- **THEN** the schedule publishes the content as it was scheduled, unless the editor explicitly reschedules with the new draft, and the admin states which version is scheduled

### Requirement: Live preview of drafts on site routes
Authorized users SHALL be able to view drafts on the real site routes via a preview mode, and share time-limited preview links with unauthenticated reviewers.

#### Scenario: Shared preview link
- **WHEN** an editor creates a preview link valid for 24 hours and a reviewer opens it after 25 hours
- **THEN** the reviewer sees an expired-link message and no draft content

### Requirement: Cache invalidation on publish
Publishing, unpublishing, and deleting SHALL invalidate any CMS-managed caches for affected routes and API responses.

#### Scenario: Cached page updated
- **WHEN** a cached published page is republished with changes
- **THEN** the next public request returns the new content
