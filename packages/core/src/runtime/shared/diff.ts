// What changed between two versions of an entry, block-aware: blocks are matched by id wherever they
// are, so a block dragged to another area is a move, not a removal and an addition.
import type { BlockLocation } from './adapter'
import type { BlockInstance } from './infer'

export type Change
  /** A field outside blocks: `path` is its key, or a dot path into an object or list. */
  = | { kind: 'field', path: string, before: unknown, after: unknown }
    | { kind: 'added', block: string, type: string, at: BlockLocation, index: number }
    | { kind: 'removed', block: string, type: string, at: BlockLocation, index: number }
    /** To another area or field, or to another place among the blocks it shared a list with. */
    | { kind: 'moved', block: string, type: string, from: { at: BlockLocation, index: number }, to: { at: BlockLocation, index: number } }
    /** One prop of a block; its areas are compared block by block instead. */
    | { kind: 'changed', block: string, type: string, prop: string, before: unknown, after: unknown }

interface Placed { block: BlockInstance, at: BlockLocation, index: number }

const isBlock = (x: unknown): x is BlockInstance =>
  typeof x === 'object' && x !== null && typeof (x as BlockInstance).id === 'string' && typeof (x as BlockInstance).type === 'string'
const isBlockList = (x: unknown): x is BlockInstance[] => Array.isArray(x) && x.length > 0 && x.every(isBlock)
const key = (at: BlockLocation) => 'field' in at ? `field:${at.field}` : `area:${at.parent}.${at.area}`

/** JSON equality with object keys in any order. */
function same(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b))
    return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** Every block in the data with where it sits; the data with each block list replaced by `[]`. */
function split(data: Record<string, unknown>): { blocks: Map<string, Placed>, rest: Record<string, unknown> } {
  const blocks = new Map<string, Placed>()
  const walk = (value: unknown, field: string): unknown => {
    if (isBlockList(value)) {
      const place = (list: BlockInstance[], at: BlockLocation) => list.forEach((block, index) => {
        blocks.set(block.id, { block, at, index })
        for (const [area, v] of Object.entries(block.props ?? {})) {
          if (isBlockList(v))
            place(v, { parent: block.id, area })
        }
      })
      place(value, { field })
      return []
    }
    if (Array.isArray(value))
      return value.map((v, i) => walk(v, `${field}.${i}`))
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, `${field}.${k}`)]))
    return value
  }
  const rest = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, walk(v, k)]))
  return { blocks, rest }
}

/** Field changes outside blocks, as precise as objects allow: lists change as a whole. */
function fieldChanges(before: unknown, after: unknown, path: string, out: Change[]) {
  if (same(before, after))
    return
  const objects = [before, after].every(v => v && typeof v === 'object' && !Array.isArray(v))
  if (!objects || !path)
    return void out.push({ kind: 'field', path, before, after })
  const a = before as Record<string, unknown>
  const b = after as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    fieldChanges(a[k], b[k], `${path}.${k}`, out)
}

/** Indexes in `seq` of a longest increasing subsequence: what stayed in order. */
function inOrder(seq: number[]): Set<number> {
  const tails: number[] = []
  const prev: number[] = []
  seq.forEach((v, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[tails[mid]!]! < v)
        lo = mid + 1
      else hi = mid
    }
    prev[i] = lo ? tails[lo - 1]! : -1
    tails[lo] = i
  })
  const kept = new Set<number>()
  for (let i = tails.at(-1) ?? -1; i !== -1; i = prev[i]!)
    kept.add(i)
  return kept
}

/**
 * The changes from `before` to `after` (entry data): fields first, then blocks in document order, removed
 * ones last. A block that changed area, or order among the blocks it still shares a list with, moved; a
 * block whose neighbours were added or removed didn't.
 */
export function diffEntries(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const a = split(before)
  const b = split(after)
  const changes: Change[] = []
  for (const k of new Set([...Object.keys(a.rest), ...Object.keys(b.rest)]))
    fieldChanges(a.rest[k], b.rest[k], k, changes)

  // per list, the blocks in both versions that stayed there: the ones out of order moved
  const moved = new Set<string>()
  const lists = new Map<string, string[]>()
  for (const [id, placed] of b.blocks) {
    const old = a.blocks.get(id)
    if (!old)
      continue
    if (key(old.at) !== key(placed.at))
      moved.add(id)
    else lists.set(key(placed.at), [...lists.get(key(placed.at)) ?? [], id])
  }
  for (const ids of lists.values()) {
    const sorted = ids.toSorted((x, y) => b.blocks.get(x)!.index - b.blocks.get(y)!.index)
    const kept = inOrder(sorted.map(id => a.blocks.get(id)!.index))
    sorted.forEach((id, i) => kept.has(i) || moved.add(id))
  }

  for (const [id, { block, at, index }] of b.blocks) {
    const old = a.blocks.get(id)
    if (!old) {
      changes.push({ kind: 'added', block: id, type: block.type, at, index })
      continue
    }
    if (moved.has(id))
      changes.push({ kind: 'moved', block: id, type: block.type, from: { at: old.at, index: old.index }, to: { at, index } })
    const props = { ...old.block.props, ...block.props }
    if (old.block.type !== block.type)
      changes.push({ kind: 'changed', block: id, type: block.type, prop: 'type', before: old.block.type, after: block.type })
    for (const prop of Object.keys(props)) {
      const [x, y] = [old.block.props?.[prop], block.props?.[prop]]
      if (!isBlockList(x) && !isBlockList(y) && !same(x, y))
        changes.push({ kind: 'changed', block: id, type: block.type, prop, before: x, after: y })
    }
  }
  for (const [id, { block, at, index }] of a.blocks) {
    if (!b.blocks.has(id))
      changes.push({ kind: 'removed', block: id, type: block.type, at, index })
  }
  return changes
}
