// Generates the configuration reference page from the module's options schema.
//   bun run docs:config   writes docs/content/3.reference/2.configuration.md
// test/docs/config-reference.test.ts fails when the committed page is out of date.
import { writeFileSync } from 'node:fs'
import * as v from 'valibot'
import { optionsSchema } from '../packages/core/src/options'

export const REFERENCE_PATH = new URL('../docs/content/3.reference/2.configuration.md', import.meta.url)

type Node = { type: string, entries?: Record<string, Node>, wrapped?: Node, pipe?: Node[], options?: unknown[], requirement?: unknown }

function typeOf(schema: Node): string {
  const [base, ...actions] = schema.pipe ?? [schema]
  if (base!.type === 'picklist')
    return base!.options!.map(o => `\`${JSON.stringify(o)}\``).join(' \\| ')
  if (base!.type === 'union')
    return (base!.options as Node[]).map(typeOf).join(' \\| ')
  if (base!.type === 'record')
    return 'object'
  if (base!.type === 'literal')
    return `\`${JSON.stringify((base as { literal?: unknown }).literal)}\``
  if (base!.type === 'number') {
    const req = (t: string) => actions.find(a => a.type === t)?.requirement
    const integer = actions.some(a => a.type === 'integer')
    return `${integer ? 'integer' : 'number'}, ${req('min_value')}–${req('max_value')}`
  }
  return base!.type
}

export function generateReference(): string {
  const sections: string[] = []
  for (const [group, groupSchema] of Object.entries((optionsSchema as unknown as Node).entries!)) {
    // an option that isn't a group of options (sites, fallbackSite): one row of its own
    if (!groupSchema.wrapped!.entries) {
      const description = v.getDescription(groupSchema.wrapped as never)
      if (!description)
        throw new Error(`atelier.${group} has no description; add v.description() to it in packages/core/src/options.ts`)
      const fallback = v.getDefault(groupSchema as never)
      sections.push(`## \`${group}\`\n\n| Option | Type | Default | Description |\n|---|---|---|---|\n| \`${group}\` | ${typeOf(groupSchema.wrapped!)} | ${fallback === undefined ? 'none' : `\`${JSON.stringify(fallback)}\``} | ${description} |`)
      continue
    }
    const rows = Object.entries(groupSchema.wrapped!.entries!).map(([key, optional]) => {
      const path = `${group}.${key}`
      const description = v.getDescription(optional.wrapped as never)
      if (!description)
        throw new Error(`atelier.${path} has no description; add v.description() to it in packages/core/src/options.ts`)
      const fallback = JSON.stringify(v.getDefault(optional as never))
      return `| \`${path}\` | ${typeOf(optional.wrapped!)} | \`${fallback}\` | ${description} |`
    })
    sections.push(`## \`${group}\`\n\n| Option | Type | Default | Description |\n|---|---|---|---|\n${rows.join('\n')}`)
  }

  return `---
title: Configuration
description: Every nuxt-atelier module option, its type and default.
---

<!-- Generated from packages/core/src/options.ts by \`bun run docs:config\`. Don't edit by hand. -->

Options go under the \`atelier\` key in \`nuxt.config.ts\`. Every option is optional. Invalid values stop the build with a message naming the option, the value and what's accepted.

\`\`\`ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-atelier'],
  atelier: {
    database: { url: 'postgres://cms@localhost:5432/atelier' },
  },
})
\`\`\`

${sections.join('\n\n')}

## Runtime overrides

These take effect in a built app without rebuilding:

| Environment variable | Overrides |
|---|---|
| \`NUXT_ATELIER_DATABASE_URL\` | \`database.url\` |
| \`NUXT_ATELIER_MIGRATIONS_AUTO_APPLY\` | \`migrations.autoApply\` |
| \`NUXT_ATELIER_STORAGE_DIR\` | \`storage.dir\` |
| \`NUXT_PUBLIC_ATELIER_SITE_URL\` | the public site URL |
| \`NUXT_APP_SECRET\` | the session secret (Nuxt's \`runtimeConfig.appSecret\`) |
`
}

if (import.meta.main)
  writeFileSync(REFERENCE_PATH, generateReference())
