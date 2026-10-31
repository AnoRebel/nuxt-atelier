// Deliberately violates the public-API-only rule. Linted only by public-api-only.test.ts.
import { writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import templates from '#build/templates'
import { something } from 'nuxt/dist/app'
import { internal } from 'nitropack/runtime/internal/app'

declare const nuxt: { options: Record<string, unknown> }

export const layers = nuxt.options._layers
const { _installedModules } = nuxt.options
writeFileSync('/tmp/out.txt', '')
await fs.mkdir('/tmp/out')

export { _installedModules, internal, something, templates }
