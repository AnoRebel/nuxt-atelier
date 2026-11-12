import type { Locales } from '../runtime/shared/locales'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { blockSchemas, discoverBlocks } from '../blocks/discover'
import { contentDirectories } from '../sources'

type SchemaKind = 'collections' | 'singletons'

const NAME_RE = /^[a-z][a-z0-9-]*$/
const FILE_RE = /^(.+)\.(?:ts|mts|js|mjs)$/

/**
 * Definition files by name, from `server/atelier/{collections,singletons}/` in the app, every layer and
 * module-added directory. The file name is the content type's name; on a clash the highest-priority one
 * (the app first) wins.
 */
export function discoverSchema(kind: SchemaKind, nuxt?: Nuxt): Map<string, string> {
  const found = new Map<string, string>()
  for (const layer of contentDirectories(nuxt)) {
    const dir = join(layer.server, 'atelier', kind)
    let files: string[]
    try {
      files = readdirSync(dir)
    }
    catch {
      continue
    }
    for (const file of files.toSorted()) {
      const name = FILE_RE.exec(file)?.[1]
      if (!name || name.endsWith('.d'))
        continue
      if (!NAME_RE.test(name))
        throw new Error(`[nuxt-atelier] ${join(dir, file)}: "${name}" is not a valid ${kind.slice(0, -1)} name; use lowercase letters, digits and "-", starting with a letter`)
      if (!found.has(name))
        found.set(name, join(dir, file))
    }
  }
  return found
}

/** `server/atelier/<name>.{ts,…}` of the app and every layer, highest priority (the app) first. */
export function layerFiles(name: 'roles' | 'tables', nuxt?: Nuxt): string[] {
  const pattern = new RegExp(`^${name}\\.(?:ts|mts|js|mjs)$`)
  return contentDirectories(nuxt).flatMap((layer) => {
    const dir = join(layer.server, 'atelier')
    let files: string[]
    try {
      files = readdirSync(dir)
    }
    catch {
      return []
    }
    const file = files.find(f => pattern.test(f))
    return file ? [join(dir, file)] : []
  })
}

/** The `#atelier-schema` server module: every definition, imported by name, and the code-defined roles. */
export function schemaTemplate(locales: Locales): string {
  const lines: string[] = []
  const exports: string[] = []
  // roles and tables: a higher-priority layer's replaces one with the same name
  for (const kind of ['roles', 'tables'] as const) {
    const imports = layerFiles(kind).map((path, i) => {
      lines.push(`import ${kind}${i} from ${JSON.stringify(path)}`)
      return `${kind}${i}`
    })
    exports.push(`export const ${kind} = Object.assign({}, ${imports.toReversed().join(', ')})`)
  }
  for (const kind of ['collections', 'singletons'] as const) {
    const entries = [...discoverSchema(kind)].map(([name, path], i) => {
      lines.push(`import ${kind}${i} from ${JSON.stringify(path)}`)
      return `  ${JSON.stringify(name)}: ${kind}${i},`
    })
    exports.push(`export const ${kind} = {\n${entries.join('\n')}\n}`)
  }
  exports.push(`export const blocks = ${JSON.stringify(blockSchemas(discoverBlocks()))}`)
  exports.push(`export const locales = ${JSON.stringify(locales)}`)
  return [...lines, '', ...exports, ''].join('\n')
}

const registryMembers = (kind: SchemaKind) => [...discoverSchema(kind)]
  .map(([name, path]) => `    ${JSON.stringify(name)}: typeof import(${JSON.stringify(path.replace(/\.[mc]?[jt]s$/, ''))}).default`)
  .join('\n')

/** Declarations filling `AtelierCollections` / `AtelierSingletons` with each definition's type. */
export function registryTypes(inferModule: string): string {
  return `export {}

declare module ${JSON.stringify(inferModule)} {
  interface AtelierCollections {
${registryMembers('collections')}
  }
  interface AtelierSingletons {
${registryMembers('singletons')}
  }
}
`
}
