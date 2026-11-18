// The entry's blocks as the editor works with them: a tree of block lists (an entry's blocks fields, and
// each block's areas), with where a block is, and immutable edits that keep placement rules. Pure.
import type { AreaRules, BlockSchema } from '#atelier/shared/blocks'
import { copyBlocks } from '#atelier/shared/blocks'
import { placeable } from '#atelier/shared/fields'

export { newBlock } from '#atelier/shared/blocks'

export interface Block { id: string, type: string, props: Record<string, unknown> }
/** A list of blocks: an entry field (`content`) or a block's area (`content.0.props.items`), with its rules. */
export interface BlockList { path: string, label: string, rules: AreaRules, blocks: TreeBlock[] }
export interface TreeBlock { id: string, type: string, label: string, path: string, areas: BlockList[] }

type Registry = Record<string, BlockSchema>
type Fields = Record<string, { type: string, label?: string, allow?: readonly string[], minItems?: number, maxItems?: number }>

const isBlock = (x: unknown): x is Block => !!x && typeof x === 'object' && typeof (x as Block).id === 'string' && typeof (x as Block).type === 'string'

function list(path: string, label: string, rules: AreaRules, value: unknown, registry: Registry): BlockList {
  const blocks = (Array.isArray(value) ? value : []).filter(isBlock).map((block, i): TreeBlock => {
    const at = `${path}.${i}`
    const schema = registry[block.type]
    return {
      id: block.id,
      type: block.type,
      label: schema?.label ?? block.type,
      path: at,
      areas: Object.entries(schema?.areas ?? {}).map(([name, area]) => list(`${at}.props.${name}`, area.label ?? name, area, block.props?.[name], registry)),
    }
  })
  return { path, label, rules, blocks }
}

/** The block lists of an entry: one per blocks field, each block with its areas. */
export function blockTree(data: Record<string, unknown>, fields: Fields, registry: Registry): BlockList[] {
  return Object.entries(fields).filter(([, f]) => f.type === 'blocks').map(([key, f]) =>
    list(key, f.label ?? key, { ...f.allow ? { allow: [...f.allow] } : {}, ...f.minItems !== undefined ? { min: f.minItems } : {}, ...f.maxItems !== undefined ? { max: f.maxItems } : {} }, data[key], registry))
}

/** Every list in the tree, depth first. */
export function allLists(lists: BlockList[]): BlockList[] {
  return lists.flatMap(l => [l, ...l.blocks.flatMap(b => allLists(b.areas))])
}

/** A block in the tree: itself, the list holding it, and its index there. */
export function locate(lists: BlockList[], id: string): { block: TreeBlock, list: BlockList, index: number } | undefined {
  for (const l of allLists(lists)) {
    const index = l.blocks.findIndex(b => b.id === id)
    if (index >= 0)
      return { block: l.blocks[index]!, list: l, index }
  }
  return undefined
}

// --- reading and writing data by dot path (`content.0.props.items`)

const keys = (path: string) => path.split('.').map(k => /^\d+$/.test(k) ? Number(k) : k)
export function get(data: unknown, path: string): unknown {
  return keys(path).reduce<unknown>((at, key) => (at as Record<string | number, unknown> | undefined)?.[key], data)
}
/** A copy of `data` with `path` set to `value` (copying only what's on the way). */
function set<T>(data: T, path: string, value: unknown): T {
  const [key, ...rest] = keys(path)
  const copy = (Array.isArray(data) ? [...data] : { ...data as object }) as Record<string | number, unknown>
  copy[key!] = rest.length ? set(copy[key!] ?? (typeof rest[0] === 'number' ? [] : {}), rest.join('.'), value) : value
  return copy as T
}
const blocksAt = (data: unknown, path: string) => (Array.isArray(get(data, path)) ? get(data, path) : []) as Block[]

/** Whether a block of `type` may go in `target` (its rules, and its size limit unless it's moving within it). */
export function accepts(target: BlockList, type: string, registry: Registry, moving = false): boolean {
  return placeable(type, registry[type], target.rules) && (moving || target.rules.max === undefined || target.blocks.length < target.rules.max)
}

/** Inserts `block` into the list at `path`, at `index`. */
export function insert<T>(data: T, path: string, index: number, block: Block): T {
  const blocks = [...blocksAt(data, path)]
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block)
  return set(data, path, blocks)
}

/** Removes the block `id` (and what's in its areas). */
export function remove<T>(data: T, lists: BlockList[], id: string): T {
  const at = locate(lists, id)
  return at ? set(data, at.list.path, blocksAt(data, at.list.path).filter(b => b.id !== id)) : data
}

/**
 * Moves block `id` to `index` in the list at `to` (its own list or another), or answers undefined when the
 * target doesn't take it or it would go inside itself.
 */
export function move<T>(data: T, lists: BlockList[], registry: Registry, id: string, to: string, index: number): T | undefined {
  const at = locate(lists, id)
  const target = allLists(lists).find(l => l.path === to)
  if (!at || !target || to.startsWith(`${at.block.path}.`))
    return undefined
  const same = at.list.path === to
  if (!accepts(target, at.block.type, registry, same))
    return undefined
  const block = get(data, at.block.path) as Block
  const without = set(data, at.list.path, blocksAt(data, at.list.path).filter(b => b.id !== id))
  // moving down its own list: the index counted the block itself
  return insert(without, to, same && index > at.index ? index - 1 : index, block)
}

/** A copy of block `id` (fresh ids, all the way down) right after it, when its list has room. */
export function duplicate<T>(data: T, lists: BlockList[], registry: Registry, id: string): { data: T, id: string } | undefined {
  const at = locate(lists, id)
  if (!at || !accepts(at.list, at.block.type, registry))
    return undefined
  const [copy] = copyBlocks([get(data, at.block.path) as Block])
  return { data: insert(data, at.list.path, at.index + 1, copy!), id: copy!.id }
}
