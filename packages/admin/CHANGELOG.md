# @nuxt-atelier/admin

## 0.1.1

### Patch Changes

- a833ed5: Blocks fields are edited as cards in the entry form (each block's fields, its nested areas, move, remove, and **Add block** with the blocks the list accepts), no longer as JSON. An entry's page is headed by its title, and the dashboard's recent activity says what happened and who did it ("Post published · by Ada") instead of showing event names.
- b8361be: Media fields show their image again (they asked for a width the server doesn't make) and wrap in narrow columns such as the visual editor's panel. Table action buttons line up, and the collapsed sidebar shows the user's initial instead of a cut-off name.
- Updated dependencies [9bb03ca]
- Updated dependencies [6e21e3a]
  - nuxt-atelier@0.1.1

## 0.1.0

### Minor Changes

- 18200bf: First release of the admin: a client-only route in a shadow root, built on crystal-neuo, with first-run setup, sign-in (passkeys and OAuth providers), collection lists with bulk actions, generated edit forms for every field type, users and roles, a dashboard, unsaved-change recovery, edit locks with takeover, presence, comments and notifications, shared block usage, entry templates and form submissions, a site switcher and per-site roles, branding and appearance per viewer, overrides by name and custom pages, on headless composables. The layer installs it with an admin home to make your own.

### Patch Changes

- Updated dependencies [7b09c1d]
  - nuxt-atelier@0.1.0
