# Nuxt Atelier

[![npm](https://img.shields.io/npm/v/nuxt-atelier?label=npm&color=cb3837)](https://www.npmjs.com/package/nuxt-atelier)
[![JSR](https://jsr.io/badges/@nuxt-atelier/core)](https://jsr.io/@nuxt-atelier/core)
[![JSR score](https://jsr.io/badges/@nuxt-atelier/core/score)](https://jsr.io/@nuxt-atelier/core)
[![CI](https://github.com/AnoRebel/nuxt-atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/AnoRebel/nuxt-atelier/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A production-grade CMS for Nuxt with a visual page builder that renders your site's own components.

**[Documentation](https://nuxt-atelier.anorebel.net)** · **[Live demo](https://nuxt-atelier-demo.anorebel.net)** (Rayleigh, a portfolio built on Nuxt Atelier; each visitor gets their own copy to edit)

> **Status:** early development, released on npm and JSR. APIs will change until `1.0.0`.

## What it is

- **A Nuxt module**: `modules: ['nuxt-atelier']`. It never takes over `app.vue`, and the admin is optional.
- **Code-first content**: collections, singletons and fields defined in TypeScript drive the database, API, validation, types and admin forms.
- **Blocks from your own components**: define blocks in a Vue SFC with `defineBlock()` or in a separate `*.block.ts` file, using any UI library (Nuxt UI, shadcn-vue, Tailwind, plain CSS).
- **Visual editor**: your real site runs in an iframe with drag and drop, inline editing, undo/redo and responsive preview. Public visitors never download editor code.
- **Pluggable storage and auth**: SQLite/libSQL, PostgreSQL and MySQL via Drizzle, a public content adapter contract for other backends, built-in auth with optional passkeys, and a Better Auth adapter.
- **Everything else a site needs**: drafts and revisions, scheduled publishing, localization, media library, SEO and sitemaps, redirects, forms, search, multi-site, webhooks and jobs.
- **Public APIs only**: built exclusively on documented Nuxt, Nitro and Vite APIs, enforced in CI. It supports Nuxt ≥ 4.6 and is Nuxt 5 ready.

## Repository layout

| Path | Package |
|---|---|
| `packages/core` | `nuxt-atelier`: module, schema, server, renderer |
| `packages/admin` | `@nuxt-atelier/admin`: headless admin + crystal-neuo kit |
| `packages/editor` | `@nuxt-atelier/editor`: visual editor |
| `packages/layer` | `@nuxt-atelier/layer`: optional starter layer |
| `packages/*` | adapters (auth, i18n, storage, AI) |
| `playground/` | development app |
| `docs/` | documentation site |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please read the section on AI-assisted contributions before opening a pull request.

## Credits

Nuxt Atelier would not exist without the projects that explored this space first. Their ideas, and the problems their users ran into, shaped much of this design:

- **[blökkli](https://github.com/blokkli/editor)** ([blokk.li](https://blokk.li)): the interactive page editor for Nuxt that showed how good in-context block editing can feel. The adapter-driven editor, the capability-based adapter contract and many editing interactions are inspired by it.
- **[Pruvious](https://github.com/pruvious/pruvious)** ([pruvious.com](https://pruvious.com)): a full CMS for Nuxt apps, which proved that the schema, admin, API and blocks can live inside the Nuxt app itself. The reactive preview edit state and the code-first collections are inspired by it.
- **[Nuxt](https://nuxt.com)**, **[Nitro](https://nitro.build)** and the wider UnJS and Vue ecosystems, which this project builds on entirely.

No code from these projects is copied into the packages. The one exception is an example: [`examples/rayleigh`](./examples/rayleigh) ports Pruvious's [Rayleigh](https://github.com/pruvious/rayleigh) portfolio template by Muris Ceman (MIT), keeping its design, components and demo content under their original copyright. If you need a CMS today, check them out.

## How this project is built

Nuxt Atelier is made with AI assistance. It is not an AI-generated project: a human maintainer owns the product direction, the architecture and the specifications, and writes and reviews the code. AI coding assistants help with parts of the work, and those parts are done under heavy human supervision and control: every AI-assisted change is reviewed, understood and approved by the maintainer before it lands, and anything that can't be explained is not merged.

## License

[MIT](./LICENSE)
