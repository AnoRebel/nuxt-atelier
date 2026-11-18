// Block schemas: what a block's fields, options and nested areas are. Read from block files at build
// time (see src/blocks/parse.ts); used by the renderer, the editor and the server's validation.
import type { Fields } from './fields'

export interface AreaRules {
  label?: string
  /** Block names, `group:<group>` or `tag:<tag>`. Only these may be placed; all when omitted. */
  allow?: string[]
  /** Block names, `group:<group>` or `tag:<tag>` that may not be placed. */
  deny?: string[]
  min?: number
  max?: number
}

/** A block's serialisable schema. */
export interface BlockSchema {
  name: string
  label?: string
  description?: string
  group?: string
  tags?: string[]
  icon?: string
  /** Content, edited in the block's form. */
  fields: Fields
  /** Presentation (variant, spacing…), edited apart from content; passed as props like fields. */
  options: Fields
  /** Nested block lists, rendered through the component's slot of the same name. */
  areas: Record<string, AreaRules>
  editor?: { proxy?: boolean }
}

// --- reusable content: shared blocks, and copies of blocks (detach, patterns, templates, paste)

/** The built-in collection holding shared blocks (when the app has blocks). */
export const SHARED_BLOCKS = 'atelier-shared-blocks'
/**
 * A reference to a shared block, as stored in a page: `{ id, type: 'atelier:shared', props: { ref } }`.
 * Reads replace it with the shared block's content, marked `shared: <ref>`; saving such a block stores the
 * reference again, so the content isn't copied. Dropping the mark (a copy) detaches it.
 */
export const SHARED_BLOCK = 'atelier:shared'

interface AnyBlock { id: string, type: string, props: Record<string, unknown>, shared?: string }

const isBlock = (x: unknown): x is AnyBlock =>
  !!x && typeof x === 'object' && typeof (x as AnyBlock).id === 'string' && typeof (x as AnyBlock).type === 'string'
  && !!(x as AnyBlock).props && typeof (x as AnyBlock).props === 'object'

/** Maps every block in `value` (any depth: fields, areas), parents before their areas; `undefined` drops one. */
function mapBlocks(value: unknown, fn: (block: AnyBlock) => AnyBlock | undefined): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isBlock(item))
        return [mapBlocks(item, fn)]
      const mapped = fn(item)
      return mapped ? [{ ...mapped, props: mapBlocks(mapped.props, fn) as Record<string, unknown> }] : []
    })
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapBlocks(item, fn)]))
  return value
}

/** The shared blocks `value` refers to. */
export function sharedRefs(value: unknown): Set<string> {
  const refs = new Set<string>()
  mapBlocks(value, (block) => {
    if (block.type === SHARED_BLOCK && typeof block.props.ref === 'string')
      refs.add(block.props.ref)
    else if (typeof block.shared === 'string')
      refs.add(block.shared)
    return block
  })
  return refs
}

/** Data with each read shared block (`shared` mark) turned back into its reference. */
export const collapseShared = <T>(value: T): T => mapBlocks(value, block =>
  typeof block.shared === 'string' ? { id: block.id, type: SHARED_BLOCK, props: { ref: block.shared } } : block) as T

/**
 * Data with each reference replaced by its shared block's content, marked `shared`: the reference's id on
 * the block, and nested ids prefixed with it, so a block shared twice on a page keeps ids unique. A
 * reference `lookup` doesn't know stays as it is (renderers skip it).
 */
export const resolveShared = <T>(value: T, lookup: (ref: string) => AnyBlock | undefined): T => mapBlocks(value, (block) => {
  const found = block.type === SHARED_BLOCK && typeof block.props.ref === 'string' ? lookup(block.props.ref) : undefined
  if (!found)
    return block
  const props = mapBlocks(structuredClone(found.props), inner => ({ ...inner, id: `${block.id}:${inner.id}` })) as Record<string, unknown>
  return { id: block.id, type: found.type, props, shared: block.props.ref as string }
}) as T

/** An independent copy of blocks: fresh ids everywhere, no link to any shared block. */
export const copyBlocks = <T>(value: T, newId: () => string = () => crypto.randomUUID()): T => mapBlocks(structuredClone(value), (block) => {
  const { shared: _, ...rest } = block
  return { ...rest, id: newId() }
}) as T

/** Data with the references to `ref` replaced by `replace(reference)`'s blocks (none removes them). */
export const replaceShared = <T>(value: T, ref: string, replace: (reference: AnyBlock) => AnyBlock | undefined): T => mapBlocks(value, block =>
  block.type === SHARED_BLOCK && block.props.ref === ref ? replace(block) : block) as T

/** A new block of `type`: its fields' and options' defaults, and empty areas. */
export function newBlock(type: string, registry: Record<string, BlockSchema>): { id: string, type: string, props: Record<string, unknown> } {
  const schema = registry[type]
  const props: Record<string, unknown> = {}
  for (const [key, field] of Object.entries({ ...schema?.fields, ...schema?.options })) {
    if (field.default !== undefined)
      props[key] = structuredClone(field.default)
  }
  for (const area of Object.keys(schema?.areas ?? {}))
    props[area] = []
  return { id: crypto.randomUUID(), type, props }
}
