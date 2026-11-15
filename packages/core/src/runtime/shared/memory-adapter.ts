// A minimal content adapter that keeps content in memory: the reference implementation of the
// contract's required operations, used by the docs demos and tests. Nothing persists past the process,
// there's no validation, and optional features (revisions) are off.
import type { BlockTypeDescriptor, ContentAdapter, ContentRef, DefinedContentAdapter, EditState, Permissions } from './adapter'
import type { Fields } from './fields'
import { blockOperations, CONTENT_ADAPTER_CONTRACT, defineContentAdapter } from './adapter'
import { defaultsFactory } from './fields'

export interface MemoryAdapterOptions {
  collections?: Record<string, Fields>
  singletons?: Record<string, Fields>
  blockTypes?: BlockTypeDescriptor[]
  /** Defaults to allowing everything: it's for demos and tests. */
  permissions?: (ref: ContentRef) => Permissions
}

const keyOf = (ref: ContentRef) => ref.kind === 'collection' ? `c:${ref.name}:${ref.id ?? ''}` : `s:${ref.name}`
const notFound = (message: string) => Object.assign(new Error(message), { statusCode: 404 })

/** A content adapter keeping content in memory, with only the required operations and no validation: a reference implementation, for demos and tests. */
export function createMemoryAdapter(options: MemoryAdapterOptions = {}): DefinedContentAdapter {
  const saved = new Map<string, { version: number, data: Record<string, unknown> }>()
  const fieldsOf = (ref: ContentRef) => {
    const fields = (ref.kind === 'collection' ? options.collections : options.singletons)?.[ref.name]
    if (!fields)
      throw notFound(`No ${ref.kind} "${ref.name}"`)
    return fields
  }

  const adapter: ContentAdapter = {
    contract: CONTENT_ADAPTER_CONTRACT,
    name: 'memory',

    async loadEditState(ref) {
      const fields = fieldsOf(ref)
      const stored = saved.get(keyOf(ref))
      if (stored)
        return { ref, version: stored.version, data: structuredClone(stored.data) }
      if (ref.kind === 'collection' && ref.id !== undefined)
        throw notFound(`No entry "${ref.id}" in "${ref.name}"`)
      return { ref, version: null, data: defaultsFactory(fields)() }
    },
    getFieldConfig: async ref => JSON.parse(JSON.stringify(fieldsOf(ref), (key, value) => key === 'validate' ? undefined : value)),
    listBlockTypes: async () => options.blockTypes ?? [],

    addBlock: async (state, at, block, index) => blockOperations.add(state, at, block, index),
    moveBlock: async (state, id, to, index) => blockOperations.move(state, id, to, index),
    updateBlock: async (state, id, props) => blockOperations.update(state, id, props),
    deleteBlock: async (state, id) => blockOperations.delete(state, id),

    async save(state: EditState) {
      fieldsOf(state.ref)
      const ref = state.ref.kind === 'collection' && state.ref.id === undefined ? { ...state.ref, id: crypto.randomUUID() } : state.ref
      const current = saved.get(keyOf(ref))?.version ?? null
      if (current !== state.version)
        throw Object.assign(new Error(`Changed by someone else: now at version ${current}`), { statusCode: 409, data: { currentVersion: current } })
      const next = { version: (current ?? 0) + 1, data: structuredClone(state.data) }
      saved.set(keyOf(ref), next)
      return { ref, version: next.version, data: structuredClone(next.data) }
    },

    permissions: async ref => options.permissions?.(ref) ?? { read: true, update: true },
  }
  return defineContentAdapter(adapter)
}
