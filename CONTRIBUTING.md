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
bun run build        # the packages: the playground, the fixtures and the docs load their dist/
bun run lint
bun run typecheck
bun run test
bun run dev          # the playground, at http://localhost:3000
bun run docs:build   # the docs site
```

CI follows these commands on a clean machine (`scripts/contributor-setup.ts`), so they stay right.

## Workspace layout

| Path | What it is |
|---|---|
| `packages/core` | `nuxt-atelier`: the module (schema, server, renderer, CLI) |
| `packages/admin` | `@nuxt-atelier/admin`: headless admin + crystal-neuo kit |
| `packages/editor` | `@nuxt-atelier/editor`: visual editor |
| `packages/layer` | `@nuxt-atelier/layer`: optional starter layer |
| `packages/auth-*`, `i18n-*`, `storage-*`, `ai` | adapter packages |
| `playground/` | development app |
| `docs/` | documentation site |
| `test/fixtures/` | minimal apps used by tests |

## Scripts

| Script | What it does |
|---|---|
| `bun run lint` | oxlint, then ESLint (includes the public-API-only rule) |
| `bun run lint:fix` | the same, with autofix |
| `bun run typecheck` | TypeScript checks |
| `bun run test` | unit, integration and e2e tests |
| `bun run build` | builds every package |
| `bun run check:pkg` | `publint` and `@arethetypeswrong/cli` on every package |
| `bun run knip` | unused files, exports, dependencies and catalog entries |
| `bun run licenses` | every package in `bun.lock` has an allowed license |
| `bun run deps` | every runtime dependency of a published package is listed, with its purpose, in [the dependencies page](docs/content/3.reference/23.dependencies.md) |
| `bun run pack` | packs the packages into `.packs/`, as they would be published, and checks them |

### Database tests

The storage tests always run against SQLite. To run them against PostgreSQL, MySQL and MariaDB as well, start the test databases (Docker) and set their URLs:

```bash
docker compose -f test/compose.yml up -d --wait
export ATELIER_TEST_POSTGRES_URL=postgres://atelier:atelier@127.0.0.1:54932/atelier
export ATELIER_TEST_MYSQL_URL=mysql://atelier:atelier@127.0.0.1:53906/atelier
export ATELIER_TEST_MARIADB_URL=mariadb://atelier:atelier@127.0.0.1:53907/atelier
bun run test
```

CI runs every engine and fails if one of these URLs is missing.

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

Every dependency, including transitive and dev-only ones, must have a license compatible with distributing Nuxt Atelier under MIT. `bun run licenses` checks every package in `bun.lock` against an allowlist of permissive licenses; run it after adding or updating a dependency. It also runs in CI and on commits that change `bun.lock`. If a package fails, pick another one, or add an entry to `EXCEPTIONS` in `scripts/check-licenses.ts` saying why its license is acceptable for how we use it (build-only, unmodified, not shipped, …).

A new runtime dependency of a published package also needs a line on the [dependencies page](docs/content/3.reference/23.dependencies.md) saying what it's for (`bun run deps` checks), and CI runs `bun audit` on what the published packages install.

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

A breaking change (a `major` bump, or before 1.0 a minor one whose summary says **Breaking**) gets a section in the [upgrading guide](./docs/content/1.getting-started/7.upgrading.md) with the migration steps, and its changeset links to that section (`/getting-started/upgrading#<section>`). CI checks it (`scripts/check-changesets.ts`).

## Releasing

Maintainers release from GitHub: **Actions → Release → Run workflow**, on `main`. It applies the pending changesets (versions and changelogs), commits and tags `<package>@<version>`, then publishes the packages to npm and JSR and creates a GitHub release per tag. It starts as a dry run, which versions and packs without pushing or publishing; untick it to release. 0.x versions go out under the `next` dist-tag.

Packages are packed with `bun pm pack`, which resolves `catalog:` and `workspace:` versions, and published with npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers): an OIDC token from the workflow, with provenance, so no npm or JSR token is stored in the repository. `bun run pack` checks the tarballs locally and in CI: each one must resolve every version and include the LICENSE.

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
