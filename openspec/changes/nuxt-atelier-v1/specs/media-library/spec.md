# Spec Delta

## Purpose

Manages uploaded files and images with metadata, organization, and responsive delivery, stored through pluggable storage drivers that survive deploys.

## ADDED Requirements

### Requirement: Uploads
Authorized users SHALL be able to upload files via the admin and API with configurable allowed types and maximum size; the server SHALL verify content type from file content, not only the extension.

#### Scenario: Disguised file
- **WHEN** a user uploads an executable renamed to `photo.jpg`
- **THEN** the upload is rejected as a disallowed type

### Requirement: Storage drivers
Media SHALL be stored through a pluggable driver with built-in drivers for local filesystem, S3-compatible storage, Cloudflare R2, and Vercel Blob; uploaded files SHALL persist across deploys and dev restarts when a persistent driver is configured.

#### Scenario: Dev restart
- **WHEN** the dev server is restarted
- **THEN** previously uploaded files are still present and served

#### Scenario: Ephemeral filesystem warning
- **WHEN** the local driver is used on a deploy target with an ephemeral filesystem
- **THEN** the build or startup emits a warning recommending a persistent driver

### Requirement: Media metadata and organization
Media items SHALL have editable metadata (title, alt text per locale, caption, credits), folders, tags, and search.

#### Scenario: Search by tag
- **WHEN** a user searches the library for tag `team`
- **THEN** only media tagged `team` is shown

### Requirement: Image processing and responsive delivery
Images SHALL support a focal point and on-demand or pre-generated resized variants in modern formats; the system SHALL provide rendering components that output responsive markup with dimensions to avoid layout shift. Where native image processing is unavailable, an external image provider SHALL be configurable.

#### Scenario: Focal point crop
- **WHEN** an image with a focal point near the right edge is rendered in a square crop
- **THEN** the crop keeps the focal point area visible

#### Scenario: Edge runtime
- **WHEN** the app runs on a runtime without native image processing
- **THEN** images are served via the configured external provider or as originals, as documented, without errors

### Requirement: Usage tracking and safe delete
The system SHALL track where each media item is used; deleting an in-use item SHALL warn and list its usages.

#### Scenario: Delete used image
- **WHEN** a user deletes an image used on three pages
- **THEN** the admin lists the three pages and requires confirmation

### Requirement: Media picker in editor
Media fields SHALL open a picker that supports browsing, searching, uploading, and drag-and-drop upload directly from the visual editor.

#### Scenario: Drop upload
- **WHEN** an editor drops an image file onto an image block in the preview
- **THEN** the file is uploaded and assigned to that block's media field

### Requirement: Resumable uploads
Large uploads SHALL be sent in chunks that a client can resume after a dropped connection, within the configured maximum size.

#### Scenario: Connection drops mid-upload
- **WHEN** a 200 MB upload loses its connection after 120 MB and the client retries
- **THEN** it continues from the last stored chunk and the finished file is identical to the original

### Requirement: Private media
Media items SHALL be markable as private: served only to signed-in users who may read media, never cached publicly, and never linked from public pages.

#### Scenario: Anonymous request for a private file
- **WHEN** a visitor who isn't signed in requests a private file's URL
- **THEN** the response is 404
