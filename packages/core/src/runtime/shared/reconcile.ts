// Schema reconciliation: content saved under an older schema may hold props a block no longer has,
// blocks whose type is gone, keys of removed sub-fields, or lack an area added since. It stays loadable
// and saveable; these functions find what's stale so the admin can show it, and repair it.
import type { BlockSchema } from './blocks'
import type { Fields } from './fields'
import type { BlockInstance } from './infer'

export type StaleContent
  /** A block prop no field, option or area of its block declares any more. */
  = | { kind: 'orphaned-prop', path: string, blockId: string, type: string, prop: string, value: unknown }
  /** A block whose type no longer exists. */
    | { kind: 'unknown-block', path: string, blockId: string, type: string }
  /** An area added to a block type since this block was saved: it reads as empty. */
    | { kind: 'missing-area', path: string, blockId: string, type: string, area: string }
  /** A key left in an object or repeater item by a removed sub-field. */
    | { kind: 'orphaned-key', path: string, key: string, value: unknown }

const isBlock = (x: unknown): x is BlockInstance =>
  !!x && typeof x === 'object' && typeof (x as BlockInstance).id === 'string' && typeof (x as BlockInstance).type === 'string'

/** Everything stale in entry data, with the path to it. */
export function findStaleContent(fields: Fields, data: Record<string, unknown>, blocks: Record<string, BlockSchema>): StaleContent[] {
  const found: StaleContent[] = []

  const blockList = (list: unknown[], path: string) => {
    list.forEach((block, i) => {
      if (!isBlock(block))
        return
      const at = `${path}.${i}`
      const schema = blocks[block.type]
      if (!schema) {
        found.push({ kind: 'unknown-block', path: at, blockId: block.id, type: block.type })
        return
      }
      const known = new Set([...Object.keys(schema.fields), ...Object.keys(schema.options), ...Object.keys(schema.areas)])
      for (const [prop, value] of Object.entries(block.props ?? {})) {
        if (!known.has(prop))
          found.push({ kind: 'orphaned-prop', path: `${at}.props.${prop}`, blockId: block.id, type: block.type, prop, value })
      }
      for (const area of Object.keys(schema.areas)) {
        const nested = block.props?.[area]
        if (nested === undefined)
          found.push({ kind: 'missing-area', path: `${at}.props.${area}`, blockId: block.id, type: block.type, area })
        else if (Array.isArray(nested))
          blockList(nested, `${at}.props.${area}`)
      }
      walk({ ...schema.fields, ...schema.options }, block.props ?? {}, `${at}.props.`, false)
    })
  }

  const walk = (defs: Fields, value: Record<string, unknown>, prefix: string, checkKeys: boolean) => {
    if (checkKeys) {
      for (const [key, v] of Object.entries(value)) {
        if (!(key in defs))
          found.push({ kind: 'orphaned-key', path: `${prefix}${key}`, key, value: v })
      }
    }
    for (const [key, field] of Object.entries(defs)) {
      const v = value[key]
      if (field.type === 'blocks' && Array.isArray(v))
        blockList(v, `${prefix}${key}`)
      else if (field.type === 'object' && v && typeof v === 'object' && !Array.isArray(v))
        walk(field.fields, v as Record<string, unknown>, `${prefix}${key}.`, true)
      else if (field.type === 'repeater' && Array.isArray(v))
        v.forEach((item, i) => item && typeof item === 'object' && walk(field.fields, item, `${prefix}${key}.${i}.`, true))
    }
  }

  walk(fields, data, '', false)
  return found
}

/** Sets or deletes the value at a dot path in a copy of `data`. */
function at(data: Record<string, unknown>, path: string, change: (parent: Record<string, unknown>, key: string) => void): Record<string, unknown> {
  const copy = structuredClone(data)
  const keys = path.split('.')
  let parent: Record<string, unknown> = copy
  for (const key of keys.slice(0, -1)) {
    const next = parent[key]
    if (!next || typeof next !== 'object')
      throw new Error(`No value at "${path}"`)
    parent = next as Record<string, unknown>
  }
  change(parent, keys.at(-1)!)
  return copy
}

/** Repairs for stale content. Each returns new data and leaves its input unchanged. */
export const contentRepairs = {
  /** Deletes stale data: an orphaned prop or key, or a block of an unknown type. */
  drop(data: Record<string, unknown>, item: StaleContent): Record<string, unknown> {
    if (item.kind === 'missing-area')
      return data
    if (item.kind === 'unknown-block') {
      return at(data, item.path, (parent, key) => {
        (parent as unknown as unknown[]).splice(Number(key), 1)
      })
    }
    return at(data, item.path, (parent, key) => {
      Reflect.deleteProperty(parent, key)
    })
  },

  /** Moves an orphaned prop or key's value to `to` (a renamed field), next to it. */
  move(data: Record<string, unknown>, item: Extract<StaleContent, { kind: 'orphaned-prop' | 'orphaned-key' }>, to: string): Record<string, unknown> {
    return at(data, item.path, (parent, key) => {
      if (parent[to] === undefined || parent[to] === null || parent[to] === '')
        parent[to] = parent[key]
      Reflect.deleteProperty(parent, key)
    })
  },

  /** Adds an empty list for an area added to the block's type. */
  addArea(data: Record<string, unknown>, item: Extract<StaleContent, { kind: 'missing-area' }>): Record<string, unknown> {
    return at(data, item.path, (parent, key) => {
      parent[key] = []
    })
  },
}
