# @nuxt-atelier/admin

## 0.2.1

### Patch Changes

- 02e77ed: The admin stays mounted while you move around it. Its route had no page key, so `<NuxtPage>` mounted it again on every navigation: everything was fetched again, and an app with a page transition showed a blank screen in between. The route now keeps one key and skips the app's page and layout transitions. Signing in and out now empties the admin's cached data in place, so views already on screen fetch it again.
- Updated dependencies [0fa9b69]
  - nuxt-atelier@0.2.2

## 0.2.0

### Minor Changes

- 1297888: Passkeys in the account menu: with `auth.passkeys`, signed-in users add a passkey on their device, see their passkeys (with when each was last used) and remove one. Until now the admin could only sign in with a passkey, and adding one meant calling the API.

### Patch Changes

- 1297888: crystal-neuo 4.3.0: inputs take content at their start and end (an icon, a reveal button), and `.cn-field-row` lines up labelled and unlabelled controls in a row of your own admin pages.
- Updated dependencies [22f8f5f]
- Updated dependencies [ffb4d09]
  - nuxt-atelier@0.2.1

## 0.1.2

### Patch Changes

- f23f2a1: The admin page has a single root element, so Nuxt 4.7 no longer warns (`NUXT_E4004`) on every admin load in development.
- 4a54142: In a row with labelled fields, a button or other control without a label now lines up with the fields' inputs, not with the middle of label and input: the Schedule section's button, the comment form's mention row, and any such row.
- Updated dependencies [2c1695b]
- Updated dependencies [113eee9]
- Updated dependencies [1e75d87]
- Updated dependencies [c1c08f7]
- Updated dependencies [dd93c0d]
- Updated dependencies [dee31ad]
  - nuxt-atelier@0.2.0

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
