---
'nuxt-atelier': patch
---

`<AtelierRichText>` renders links to the site's own pages with `NuxtLink` again, so they navigate in the app instead of reloading the page. It looked `NuxtLink` up as a global component, which Nuxt's aren't, and fell back to a plain `<a>` with a Vue warning.
