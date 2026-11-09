# Lessons from the parent projects' issue trackers

Read on 2026-11-08: every issue in [blokkli/editor](https://github.com/blokkli/editor/issues) (42) and
[pruvious/pruvious](https://github.com/pruvious/pruvious/issues) (137). This file lists the bugs we must not
repeat and the feature requests users made, each tied to the task that covers it. Ideas only: no code is
taken from either project. `P#` is a Pruvious issue, `B#` a blökkli one.

## Bugs not to repeat

| Issue | What went wrong | Where we prevent it |
|---|---|---|
| P#127 | a path like `//www.google.com` redirected off-site (open redirect) | 9.5: redirect sources and targets are normalised; a `Location` is never protocol-relative, and only an admin-entered absolute URL leaves the site; e2e for `//host` paths |
| P#84 | adding the CMS to an app with its own `pages/` failed (expected a page file of its own) | 9.1, 9.2: the catch-all is added via `extendPages` at the lowest priority and needs no files in the host |
| P#12, P#3, P#77 | listing cards couldn't get an entry's URL; link fields ignored locales; the link picker only showed the default locale | 9.1: entries of routable types carry their path; 9.6: links by id, resolved per locale; 13.1, 14.4: pickers search every locale |
| P#73 | a collection's URL prefix couldn't be translated (`/projects` in every locale) | 9.1/13.1: URL patterns may be set per locale (decision pending, see below) |
| P#155 | previews of non-routable records rendered the site's `/` page | 10.5, 14.1: previews of non-routable content use a dedicated preview route, never the site root |
| P#116 | cached reads sometimes served defaults/empty values | 10.6, 23.x: never cache an error or a fallback; cache keys include locale and draft/published |
| P#150 | a pending edit was committed onto a different block | 14.3, 14.6: pending edits are bound to the block id they started on and flushed before selection changes |
| P#151, P#152, P#154 | stale block props made records unsaveable; a new slot crashed old records; defaults shared by reference | done in 4.3/8.5/8.8: stale props kept and repairable, missing areas read as empty, defaults copied per instance |
| P#153 | the dashboard deleted stylesheets it didn't own | 14.9, 15.2: the admin is isolated in Shadow DOM and never touches host styles |
| P#81 | the profile page needed "read users" permission | 15.4: a user can always read and update their own profile |
| P#63 | a folder mirroring an absolute path was created in the project | 12.1: upload paths are resolved absolutely, outside the source tree |
| P#114 | the configured upload size limit wasn't applied everywhere | 12.3: one limit enforced by the server (and documented for proxies), tested above the default |
| P#49 | admin translations couldn't be extended from layers | 17.x/admin i18n: admin translations merge across layers, app last |
| P#60 | sessions were lost on every deploy | done in 6.x: sessions are stored in the database |
| B#53 | the editor offered drops that the field's rules forbid | 14.5: the editor uses the same `placeable()` rules as the server |
| B#41 | the picker offered blocks for areas the component never renders | 14.4: the picker lists only blocks some rendered area accepts |
| B#56 | the editor's own helper elements ended up in the selection | 14.3: selection only from elements carrying `data-at-block` |
| B#35 | inline-edited text drifted from the stored value after cancel or undo | 14.6, 14.7: cancel and undo restore from the edit state, not the DOM |
| B#15 | a wrong field name on the field wrapper failed silently | 14.3: in previews, `<AtelierField>` warns about a name its block doesn't declare |
| B#54 | blocks from layers couldn't be overridden | done in 8.4 |

## Feature requests

Already planned: content versioning (P#113, section 10), OAuth and third-party sign-in (P#118, Better
Auth), object fields (P#110), custom field types (P#78), field groups (P#22, `object`), reusable layout
pieces (P#76, B#10, section 17), visual editing (P#101, section 14), multi-site (P#27, section 21),
fields shared across locales (P#30, P#68, 13.1/13.2), proxy blocks (B#34, 14.8), sessions as auth for
the host's own server routes (P#100, P#120, `requireUser`).

Done while reading: an empty area passes no slot on public pages, so a block can check `$slots.<area>`
(P#82, B#13).

Done on the maintainer's request (2026-11-09): P#93, slot props for nested blocks. A block reads the props
its parent passes to the area's slot, and the areas around it, with `useAtelierArea()` (8.11). They come
through injection, never as the nested block's props or attributes, so a slot prop can't override a field or
leak into the HTML as an attribute (as an extra prop would on any block that doesn't declare it).

Added to v1 by the maintainer (2026-11-08):

- per-locale URL patterns (P#73): 9.1
- two-way relations (P#124): 4.9
- creating a related entry from inside a relation field (P#32): 15.11
- a placeholder in previews for blocks that render nothing (B#24), and inline editing of the entry's own fields (B#23): 14.12

## ohne (2026-11-09)

[ohne](https://ohne.dev) ([ohnejs/ohnejs](https://github.com/ohnejs/ohnejs), MIT) is Muris Ceman's framework after
Pruvious: a zero-dependency TypeScript content backend. Most of what it offers is already planned here: layers,
per-locale data, blocks, webhooks, locks, health and readiness, an AI layer. Added to v1 by the maintainer:

- conditional fields: 4.10
- rehearsing migrations against a live database (`--dry-run`): 5.11
- resumable uploads and private media: 12.10
- an assistant that proposes API requests the user approves and sends with their own session: 22.5

Ideas only, as with Pruvious: no code is taken.

## Rayleigh (2026-11-09)

Pruvious's tutorial builds [Rayleigh](https://github.com/pruvious/rayleigh) (MIT, © Muris Ceman), a portfolio
template, and stops before its contact form and deployment chapters. The maintainer asked to port it and finish the
tutorial: 25.6 (the template, keeping its copyright notice) and 25.7 (the tutorial, in our own words). This is
the one place where code from a parent project is used, under its license.

