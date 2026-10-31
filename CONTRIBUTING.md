# Contributing to Nuxt Atelier

Thanks for helping. This guide gets you from a clean clone to running lint, build and tests.

## Setup

Requirements:

- [Bun](https://bun.com) 1.4.4 (the package manager and script runner)
- Node.js `^22.22.3`, `^24.15.0` or `>=26` (Nuxt's supported range)

```bash
git clone https://github.com/AnoRebel/nuxt-atelier.git
cd nuxt-atelier
bun install          # also installs the git hooks
bun run lint
bun run typecheck
bun run test
bun run build
```

## Workspace layout

| Path | What it is |
|---|---|
| `packages/core` | `nuxt-atelier`: the module (schema, server, renderer, CLI) |
| `packages/admin` | `@nuxt-atelier/admin`: headless admin + Nuxt UI kit |
| `packages/editor` | `@nuxt-atelier/editor`: visual editor |
| `packages/layer` | `@nuxt-atelier/layer`: optional starter layer |
| `packages/auth-*`, `i18n-*`, `storage-*`, `ai` | adapter packages |
| `playground/` | development app |
| `docs/` | documentation site |
| `test/fixtures/` | minimal apps used by tests |
| `openspec/` | specifications and the implementation plan |

## Scripts

| Script | What it does |
|---|---|
| `bun run lint` | oxlint, then ESLint (includes the public-API-only rule) |
| `bun run lint:fix` | the same, with autofix |
| `bun run typecheck` | TypeScript checks |
| `bun run test` | unit tests |
| `bun run build` | builds every package |
| `bun run check:pkg` | `publint` and `@arethetypeswrong/cli` on every package |
| `bun run knip` | unused files, exports, dependencies and catalog entries |

## Toolchain notes

- **vue-tsc 3.3.14** (with TypeScript 6.0.3). vue-tsc 3.3.12 and 3.3.13 lose the types of imported bindings used inside template closures ([vuejs/language-tools#6237](https://github.com/vuejs/language-tools/issues/6237)), which our nested scoped slots hit. `test/vue-tsc/NestedSlots.vue` reproduces it: it fails on 3.3.13 and passes on 3.3.11 and 3.3.14, and `bun run typecheck` runs it. Don't move vue-tsc to a version that fails it; pin 3.3.11 if a new release regresses.

- **Docs and Nuxt SEO v6.** Docus 5.15.0 still depends on the previous Nuxt SEO modules. The root `package.json` `overrides` force the v6 ones (`nuxt-og-image` 7, `@nuxtjs/sitemap` 9, `@nuxtjs/robots` 7, `nuxt-schema-org` 7, `nuxt-site-config` 5). Remove them once Docus ships with v6.
- **Docs and Nuxt 5.** The docs opt into `compatibilityVersion: 5` with `experimental.nitroAutoImports: true`, because Docus's `nuxt-llms` still imports `useNitroApp` from `#imports`.

## Dependency versions

All dependency versions are defined once in the root `package.json` as [Bun catalogs](https://bun.com/docs/pm/catalogs). In a package, reference them instead of writing a version:

```json
{ "dependencies": { "valibot": "catalog:" }, "devDependencies": { "vitest": "catalog:test" } }
```

Catalog entries that published packages depend on at runtime use caret ranges (`^1.5.0`), so users don't end up with duplicate copies. Tooling, test and docs entries are exact, and so is Drizzle while it's a release candidate. `bun.lock` pins everything for this repo.

The catalogs only list dependencies something uses (`bun run knip` fails on unused entries). To add a dependency, add it to the right catalog, creating that catalog if needed, and explain in your PR why it's needed. Every runtime dependency has to justify its weight.

## Public APIs only

Nuxt Atelier must keep working across Nuxt 4.6+ and Nuxt 5, so package code may only use documented Nuxt, Nitro and Vite APIs. Lint enforces this. It rejects:

- imports from `#build/*`, `nuxt/dist/*` and `nitropack/runtime/internal/*`
- reading private `nuxt.options._*` fields
- writing files directly from module code (use `addTemplate` and friends)

If you think you need an internal API, open an issue first.

## Commits and branches

Commits follow semantic commit types; a git hook rejects anything else:

```
<type>(<optional scope>)!: <subject>
```

Types: `feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `chore`, `ci`, `build`, `revert`.

Branches use the same types: `feat/block-system`, `fix/media-upload-limit`, `docs/editor-guide`.

## Changesets

Any change that affects a published package needs a changeset:

```bash
bunx changeset
```

Pick the affected packages and the bump type, and write the summary for users (it ends up in the changelog). Docs-only and CI-only changes don't need one.

## AI-assisted contributions

Using AI tools is fine. This project is made with AI assistance too. Two rules apply:

1. **Say so.** If AI tools wrote or substantially shaped any part of your PR, state it in the PR description: which tool, and which parts.
2. **Understand your PR.** You must be able to explain every change in it, how it works, and why it's needed, without going back to the AI. Reviewers will ask. A PR whose author can't explain it will be closed, however good it looks.

Low-effort, unreviewed AI output (bulk refactors, speculative features, generated docs nobody read) wastes maintainer time and will be closed.

## Pull requests

- Keep PRs focused: one change per PR.
- Make sure `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build` pass.
- Add or update tests for behaviour changes, and docs for user-facing changes.
- Fill in the PR template, including the AI disclosure.

## Reporting security issues

Don't open a public issue. See [SECURITY.md](./SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
