// The built-in content adapter: the content adapter contract on the app's own database.
import type { AdapterContext, BlockTypeDescriptor, ContentAdapter, ContentRef, DefinedContentAdapter, EditState, Permissions } from '../shared/adapter'
import type { Fields } from '../shared/fields'
import type { EntryStore } from './db/store'
import type { ContentSchema } from './db/tables'
import { blockOperations, CONTENT_ADAPTER_CONTRACT, defineContentAdapter } from '../shared/adapter'
import { defaultsFactory, serialiseFields } from '../shared/fields'
import { NotFoundError } from './db/store'

export interface DatabaseAdapterOptions {
  store: EntryStore
  schema: ContentSchema
  /** Who may read and update what. Required: there's no safe default. */
  permissions: (ref: ContentRef, context?: AdapterContext) => Permissions | Promise<Permissions>
  /** The block types the editor offers (from the block registry). */
  blockTypes?: BlockTypeDescriptor[]
}

/** The caller may not do this. */
export class ForbiddenError extends Error {
  readonly statusCode = 403
}

export function createDatabaseAdapter(options: DatabaseAdapterOptions): DefinedContentAdapter {
  const { store, schema } = options

  function fieldsOf(ref: ContentRef): Fields {
    const definition = ref.kind === 'collection' ? schema.collections[ref.name] : schema.singletons[ref.name]
    if (!definition)
      throw new NotFoundError(`No ${ref.kind} "${ref.name}"`)
    return definition.fields
  }

  async function require(ref: ContentRef, action: keyof Permissions, context?: AdapterContext) {
    if (!(await options.permissions(ref, context))[action])
      throw new ForbiddenError(`Not allowed to ${action} ${ref.kind} "${ref.name}"`)
  }

  const adapter: ContentAdapter = {
    contract: CONTENT_ADAPTER_CONTRACT,
    name: 'database',

    async loadEditState(ref, context) {
      await require(ref, 'read', context)
      const fresh = () => ({ ref, version: null, data: defaultsFactory(fieldsOf(ref))() })
      if (ref.kind === 'singleton') {
        const saved = await store.getSingleton(ref.name)
        return saved ? { ref, version: saved.version, data: saved.data } : fresh()
      }
      if (ref.id === undefined)
        return fresh()
      const entry = await store.get(ref.name, ref.id)
      if (!entry)
        throw new NotFoundError(`No entry "${ref.id}" in "${ref.name}"`)
      return { ref, version: entry.version, data: entry.data }
    },

    // JSON-safe: custom validators are server-only functions
    getFieldConfig: async ref => JSON.parse(serialiseFields(fieldsOf(ref))),
    listBlockTypes: async () => options.blockTypes ?? Object.values(schema.blocks ?? {}).map(({ name, fields, options: blockOptions, ...meta }) =>
      JSON.parse(serialiseFields({ type: name, ...meta, fields, options: blockOptions }))),

    addBlock: async (state, at, block, index) => blockOperations.add(state, at, block, index),
    moveBlock: async (state, id, to, index) => blockOperations.move(state, id, to, index),
    updateBlock: async (state, id, props) => blockOperations.update(state, id, props),
    deleteBlock: async (state, id) => blockOperations.delete(state, id),

    async save(state: EditState, context) {
      const { ref } = state
      await require(ref, 'update', context)
      if (ref.kind === 'singleton') {
        const saved = await store.saveSingleton(ref.name, { version: state.version, data: state.data })
        return { ref, version: saved.version, data: saved.data }
      }
      const entry = await store.save(ref.name, { id: ref.id, version: state.version ?? undefined, data: state.data })
      return { ref: { ...ref, id: entry.id }, version: entry.version, data: entry.data }
    },

    permissions: async (ref, context) => options.permissions(ref, context),

    revisions: {
      async list(ref) {
        const id = ref.kind === 'collection' ? ref.id : ref.name
        if (id === undefined)
          return []
        return (await store.revisions(ref.name, id)).map(({ version, createdAt }) => ({ version, createdAt }))
      },
      async load(ref, version) {
        const id = ref.kind === 'collection' ? ref.id : ref.name
        const revision = id === undefined ? undefined : (await store.revisions(ref.name, id)).find(r => r.version === version)
        if (!revision)
          throw new NotFoundError(`No version ${version} of ${ref.kind} "${ref.name}"`)
        return { ref, version, data: revision.data }
      },
    },
  }
  return defineContentAdapter(adapter)
}
