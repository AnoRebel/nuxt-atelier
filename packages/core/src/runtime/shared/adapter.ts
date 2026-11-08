// The content adapter contract, published as `nuxt-atelier/adapter`. The admin and the visual editor
// talk to content only through an adapter, so any backend that implements the required operations can
// power them. The built-in database backend is one implementation (createDatabaseAdapter).
//
// Versioned: an adapter declares the contract version it implements, and defineContentAdapter refuses
// one it doesn't know. Optional operations switch features on: `capabilities` says which are present,
// and the UI hides what an adapter doesn't implement instead of calling it.
import type { AreaRules } from './blocks'
import type { Fields } from './fields'
import type { BlockInstance } from './infer'

/** The contract version this release implements. */
export const CONTENT_ADAPTER_CONTRACT = 1

/** What is being edited: a collection entry (no `id` for a new one) or a singleton. */
export type ContentRef
  = | { kind: 'collection', name: string, id?: string }
    | { kind: 'singleton', name: string }

/** Everything the editor needs to edit one piece of content. */
export interface EditState {
  ref: ContentRef
  /** The version this state is based on; null when it was never saved. Sent back with save. */
  version: number | null
  data: Record<string, unknown>
}

/** Where a block list is: a `blocks` field of the content, or a named area of a block. */
export type BlockLocation = { field: string } | { parent: string, area: string }

export interface BlockTypeDescriptor {
  type: string
  label?: string
  description?: string
  group?: string
  tags?: string[]
  icon?: string
  /** The block's props, described like content fields. */
  fields: Fields
  /** Presentation options, also passed as props. */
  options?: Fields
  /** Nested block areas, by name. */
  areas?: Record<string, AreaRules>
}

export interface Permissions {
  read: boolean
  update: boolean
}

/** Who is asking: whatever the host's auth gives (a user, an API token). Adapters pass it on. */
export interface AdapterContext {
  user?: unknown
}

export interface RevisionSummary {
  version: number
  createdAt: string
}

export interface ContentAdapter {
  /** The contract version implemented: CONTENT_ADAPTER_CONTRACT when written. */
  contract: number
  name: string

  // Required
  loadEditState: (ref: ContentRef, context?: AdapterContext) => Promise<EditState>
  getFieldConfig: (ref: ContentRef) => Promise<Fields>
  listBlockTypes: () => Promise<BlockTypeDescriptor[]>
  addBlock: (state: EditState, at: BlockLocation, block: BlockInstance, index?: number) => Promise<EditState>
  moveBlock: (state: EditState, id: string, to: BlockLocation, index?: number) => Promise<EditState>
  updateBlock: (state: EditState, id: string, props: Record<string, unknown>) => Promise<EditState>
  deleteBlock: (state: EditState, id: string) => Promise<EditState>
  /** Persists the state. Rejects with a 409 error (`statusCode`, `data.currentVersion`) when it's stale. */
  save: (state: EditState, context?: AdapterContext) => Promise<EditState>
  permissions: (ref: ContentRef, context?: AdapterContext) => Promise<Permissions>

  // Optional
  revisions?: {
    list: (ref: ContentRef) => Promise<RevisionSummary[]>
    load: (ref: ContentRef, version: number) => Promise<EditState>
  }
}

/** The optional features an adapter supports. */
export interface AdapterCapabilities {
  revisions: boolean
}

export type DefinedContentAdapter = ContentAdapter & { readonly capabilities: Readonly<AdapterCapabilities> }

const REQUIRED = ['loadEditState', 'getFieldConfig', 'listBlockTypes', 'addBlock', 'moveBlock', 'updateBlock', 'deleteBlock', 'save', 'permissions'] as const

/**
 * Checks an adapter against the contract and adds its `capabilities`. Throws when it implements another
 * contract version or misses a required operation, naming what's wrong.
 */
export function defineContentAdapter(adapter: ContentAdapter): DefinedContentAdapter {
  if (adapter.contract !== CONTENT_ADAPTER_CONTRACT)
    throw new Error(`[nuxt-atelier] Content adapter "${adapter.name}" implements contract ${adapter.contract}; this version of nuxt-atelier supports contract ${CONTENT_ADAPTER_CONTRACT}`)
  const missing = REQUIRED.filter(method => typeof adapter[method] !== 'function')
  if (missing.length)
    throw new Error(`[nuxt-atelier] Content adapter "${adapter.name}" is missing required operations: ${missing.join(', ')}`)
  const capabilities = Object.freeze({
    revisions: typeof adapter.revisions?.list === 'function' && typeof adapter.revisions?.load === 'function',
  })
  return Object.freeze({ ...adapter, capabilities })
}

/** A bad block operation, e.g. an unknown block id. */
export class BlockOperationError extends Error {
  readonly statusCode = 400
}

const isBlock = (x: unknown): x is BlockInstance =>
  typeof x === 'object' && x !== null && typeof (x as BlockInstance).id === 'string' && typeof (x as BlockInstance).type === 'string'

/** Every block list in the data: `blocks` fields and nested areas (block props holding block lists). */
function* blockLists(value: unknown): Generator<BlockInstance[]> {
  if (Array.isArray(value)) {
    if (value.length && value.every(isBlock))
      yield value as BlockInstance[]
    for (const item of value)
      yield* blockLists(isBlock(item) ? item.props : item)
  }
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value))
      yield* blockLists(child)
  }
}

function find(data: Record<string, unknown>, id: string): { list: BlockInstance[], index: number } {
  for (const list of blockLists(data)) {
    const index = list.findIndex(b => b.id === id)
    if (index !== -1)
      return { list, index }
  }
  throw new BlockOperationError(`No block "${id}"`)
}

function listAt(data: Record<string, unknown>, at: BlockLocation): BlockInstance[] {
  const holder: Record<string, unknown> = 'field' in at ? data : find(data, at.parent).list.find(b => b.id === at.parent)!.props
  const key = 'field' in at ? at.field : at.area
  const list = holder[key] ?? (holder[key] = [])
  if (!Array.isArray(list))
    throw new BlockOperationError(`"${key}" isn't a block list`)
  return list as BlockInstance[]
}

const next = (state: EditState, change: (data: Record<string, unknown>) => void): EditState => {
  const data = structuredClone(state.data)
  change(data)
  return { ...state, data }
}

const insert = (list: BlockInstance[], block: BlockInstance, index = list.length) =>
  list.splice(Math.max(0, Math.min(index, list.length)), 0, block)

/** Block operations on an edit state, returning a new state. Adapters can use them to implement the contract. */
export const blockOperations = {
  add(state: EditState, at: BlockLocation, block: BlockInstance, index?: number): EditState {
    return next(state, (data) => {
      if (!isBlock(block))
        throw new BlockOperationError('A block needs an id and a type')
      if ([...blockLists(data)].some(list => list.some(b => b.id === block.id)))
        throw new BlockOperationError(`A block "${block.id}" already exists`)
      insert(listAt(data, at), structuredClone({ ...block, props: block.props ?? {} }), index)
    })
  },
  move(state: EditState, id: string, to: BlockLocation, index?: number): EditState {
    return next(state, (data) => {
      const { list, index: from } = find(data, id)
      const [block] = list.splice(from, 1) as [BlockInstance]
      if ('parent' in to && (to.parent === id || [...blockLists(block.props)].some(l => l.some(b => b.id === to.parent))))
        throw new BlockOperationError(`Block "${id}" can't move into itself`)
      insert(listAt(data, to), block, index)
    })
  },
  update(state: EditState, id: string, props: Record<string, unknown>): EditState {
    return next(state, (data) => {
      const { list, index } = find(data, id)
      list[index] = { ...list[index]!, props: { ...list[index]!.props, ...structuredClone(props) } }
    })
  },
  delete(state: EditState, id: string): EditState {
    return next(state, (data) => {
      const { list, index } = find(data, id)
      list.splice(index, 1)
    })
  },
}
