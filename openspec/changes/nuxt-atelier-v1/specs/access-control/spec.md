# Spec Delta

## Purpose

Authenticates CMS users through a pluggable auth adapter and authorizes every action with role-based, granular permissions.

## ADDED Requirements

### Requirement: Auth adapter
Authentication SHALL go through an auth adapter interface (resolve current user, sign in/out, manage users) so the identity provider can be swapped without changing CMS behavior.

#### Scenario: Swap adapter
- **WHEN** the configuration switches from the built-in adapter to another supported adapter
- **THEN** admin login, permission checks, and API access work with the new provider

### Requirement: Built-in auth default
By default the system SHALL provide email/password users with securely hashed passwords, sealed HTTP-only session cookies, logout that invalidates the session, password reset, and a first-run flow to create the initial administrator.

#### Scenario: First run
- **WHEN** the admin is opened on an instance with no users
- **THEN** a setup screen creates the first administrator, and this screen is unavailable once any user exists

#### Scenario: Session cookie flags
- **WHEN** a user logs in over HTTPS
- **THEN** the session cookie is HTTP-only, Secure, and SameSite=Lax or stricter

### Requirement: Passkey sign-in
The built-in adapter SHALL optionally support passkey (WebAuthn) sign-in, disabled by default. When enabled, signed-in users SHALL be able to register and remove passkeys and sign in with them, with user verification required; the password SHALL remain available for recovery.

#### Scenario: Register and sign in with a passkey
- **WHEN** passkeys are enabled and a signed-in user registers a passkey, signs out, and signs in with that passkey
- **THEN** they are signed in with the same role and permissions as with their password, and the registration and sign-in are recorded in the audit log

#### Scenario: Passkeys disabled
- **WHEN** passkeys are not enabled
- **THEN** the login screen offers no passkey option and the passkey endpoints return 404

### Requirement: Better Auth adapter
The system SHALL provide an official adapter for Better Auth that uses the CMS database, enabling its OAuth, two-factor, and passkey features while CMS roles and permissions continue to apply.

#### Scenario: OAuth login
- **WHEN** the Better Auth adapter is configured with an OAuth provider and a user signs in through it
- **THEN** the user is mapped to a CMS user with an assigned role and can access the admin per that role

### Requirement: Roles and permissions
The system SHALL support roles with permissions per collection/singleton and operation (create, read, update, delete, publish), plus admin capabilities (manage users, roles, settings, media), with a built-in administrator role that cannot be locked out.

#### Scenario: Editor without publish
- **WHEN** a user whose role lacks `publish` on `articles` edits an article
- **THEN** they can save drafts but the publish action is unavailable and the publish endpoint returns 403

#### Scenario: Last administrator
- **WHEN** an administrator tries to remove the administrator role from the only remaining administrator
- **THEN** the change is refused

### Requirement: Field and entry level rules
Permissions SHALL support field-level read/write restrictions and entry-level conditions (e.g. only entries the user authored).

#### Scenario: Own entries only
- **WHEN** a role is limited to updating entries it authored and a user attempts to update another user's entry
- **THEN** the update is rejected with 403

### Requirement: CSRF protection
State-changing requests authenticated by cookie SHALL be protected against cross-site request forgery.

#### Scenario: Cross-site POST
- **WHEN** a cross-origin form posts to a CMS write endpoint using the victim's session cookie
- **THEN** the request is rejected

### Requirement: Audit log
Security-relevant events (logins, failed logins, role and permission changes, token creation/revocation, publishes, deletions) SHALL be recorded with actor, time, and target, viewable by administrators.

#### Scenario: Role change recorded
- **WHEN** an administrator changes a user's role
- **THEN** an audit entry records who changed it, when, and the old and new role
