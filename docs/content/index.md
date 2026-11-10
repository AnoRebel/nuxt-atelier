---
seo:
  title: Nuxt Atelier
  description: A visual CMS for Nuxt that you add to an existing app as a module.
---

::u-page-hero
---
orientation: vertical
---
#headline
:::u-badge{color="warning" variant="subtle" icon="i-lucide-construction"}
In early development, not released yet
:::

#title
A visual CMS for your Nuxt app

#description
Add it as a module: a typed content schema, a block-based visual editor and an admin dashboard, with your pages, layouts and `app.vue` left alone.

#links
:::u-button
---
to: /getting-started/introduction
size: xl
trailing-icon: i-lucide-arrow-right
---
Get started
:::

:::u-button
---
to: https://github.com/AnoRebel/nuxt-atelier
target: _blank
size: xl
color: neutral
variant: subtle
icon: i-simple-icons-github
---
GitHub
:::
::

::u-page-section
---
title: Everything a content site needs, in your app
---
#features
:::u-page-feature
---
icon: i-lucide-braces
title: Content in code
description: Collections and singletons defined in TypeScript, with typed queries, migrations for SQLite, Postgres, MySQL, MariaDB and Cloudflare D1, and data that never changes shape behind your back.
to: /reference/content-schema
---
:::

:::u-page-feature
---
icon: i-lucide-blocks
title: Your components are the blocks
description: Any Vue component becomes a block. Pages are built from them, nested in areas, rendered with your own styles and UI library.
to: /reference/blocks
---
:::

:::u-page-feature
---
icon: i-lucide-send
title: Drafts, publishing, history
description: Work on drafts the site doesn't see, publish now or on a schedule, share preview links, compare versions block by block and restore any of them.
to: /guides/drafts-and-publishing
---
:::

:::u-page-feature
---
icon: i-lucide-route
title: Pages at their URLs
description: Entries get URL patterns, per locale too, nested under their parents. Renames redirect on their own, and your own pages always come first.
to: /reference/routing
---
:::

:::u-page-feature
---
icon: i-lucide-image
title: Media library
description: Uploads checked by their content, streamed to disk, S3, R2 or Vercel Blob, with focal points, tags, private files and a record of where each one is used.
to: /reference/media
---
:::

:::u-page-feature
---
icon: i-lucide-plug
title: Built to extend
description: A REST API with roles, API tokens and OpenAPI; lifecycle hooks, signed webhooks, background jobs on any host, and plugins as layers or modules.
to: /reference/content-api
---
:::
::
