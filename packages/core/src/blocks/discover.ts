// Where blocks live and how the app and server get them: `blocks/` in the app and every layer
// (`app/blocks/` with Nuxt 4's layout), `.vue` files calling defineBlock() and `*.block.ts` files.
import type { Nuxt } from '@nuxt/schema'
import type { BlockSchema } from '../runtime/shared/blocks'
import type { ParsedBlock } from './parse'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { useLogger } from '@nuxt/kit'
import { contentDirectories } from '../sources'
import { BlockDefinitionError, parseBlockFile, parseBlockSfc } from './parse'

/** Block directories, highest priority (the app) first. */
export const blockDirectories = (nuxt?: Nuxt) => contentDirectories(nuxt).map(layer => join(layer.app, 'blocks'))

const BLOCK_FILE = /\.block\.[mc]?[jt]s$/

function files(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  }
  catch {
    return []
  }
  return names.toSorted().flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : name.endsWith('.vue') || BLOCK_FILE.test(name) ? [path] : []
  })
}

export interface DiscoveredBlock extends ParsedBlock {
  file: string
}

/**
 * Every block by name. On a name used in two layers, the higher-priority one (the app first) wins;
 * twice in one layer is an error naming both files.
 */
export function discoverBlocks(nuxt?: Nuxt): Map<string, DiscoveredBlock> {
  const found = new Map<string, DiscoveredBlock>()
  for (const dir of blockDirectories(nuxt)) {
    const inLayer = new Map<string, DiscoveredBlock>()
    for (const file of files(dir)) {
      const source = readFileSync(file, 'utf8')
      const parsed = file.endsWith('.vue') ? parseBlockSfc(source, file) : parseBlockFile(source, file)
      if (!parsed)
        continue // a plain component next to the blocks
      const name = parsed.schema.name
      const other = inLayer.get(name)
      if (other)
        throw new BlockDefinitionError(file, 1, 1, `the block name "${name}" is already used by ${relative(dir, other.file)}: rename one, or give it \`name\` in defineBlock()`)
      inLayer.set(name, { ...parsed, file })
    }
    for (const [name, block] of inLayer) {
      if (found.has(name))
        useLogger('nuxt-atelier').debug(`Block ${name}: ${found.get(name)!.file} overrides ${block.file}`)
      else
        found.set(name, block)
    }
  }
  return found
}

/** Schemas by block name, for the server and the editor. */
export const blockSchemas = (blocks: Map<string, DiscoveredBlock>): Record<string, BlockSchema> =>
  Object.fromEntries([...blocks].map(([name, block]) => [name, block.schema]))

/**
 * The `#atelier-blocks` app module: each block's component as a lazy import, and its area names.
 * No schemas, so public pages don't load them.
 */
export function blockComponentsTemplate(blocks: Map<string, DiscoveredBlock>, components: Map<string, { filePath: string, export: string }> = new Map()): string {
  const entries = [...blocks].map(([name, block]) => {
    const { component, file } = block
    let loader: string
    if ('self' in component) {
      loader = `() => import(${JSON.stringify(file)}).then(m => m.default)`
    }
    else if (component.from === '#components') {
      // Nuxt rewrites static #components imports, not dynamic ones: import the component's file
      const found = components.get(component.export)
      if (!found)
        throw new BlockDefinitionError(file, 1, 1, `no component "${component.export}" in #components`)
      loader = `() => import(${JSON.stringify(found.filePath)}).then(m => m[${JSON.stringify(found.export)}])`
    }
    else {
      const from = component.from.startsWith('.') ? resolve(dirname(file), component.from) : component.from
      // destructuring lets the bundler keep only this export of a library's barrel
      loader = component.export === 'default'
        ? `() => import(${JSON.stringify(from)}).then(m => m.default)`
        : `() => import(${JSON.stringify(from)}).then(({ ${component.export} }) => ${component.export})`
    }
    return `  ${JSON.stringify(name)}: { component: ${loader}, areas: ${JSON.stringify(Object.keys(block.schema.areas))} },`
  })
  return `export const blocks = {\n${entries.join('\n')}\n}\n`
}
