---
'nuxt-atelier': patch
---

`nuxt dev` on a fresh clone (no `.nuxt` yet) applies the schema on its first start. The dev migration ran before Nuxt wrote `.nuxt/tsconfig.json`, so with a `tsconfig.json` that extends it, drizzle-kit failed with "File './.nuxt/tsconfig.json' not found" until the next start.
