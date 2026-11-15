// Content kept outside the app's database: types an adapter serves (the content adapter contract,
// `nuxt-atelier/adapter`). An app registers one in a Nitro plugin; the admin's entry form and the visual
// editor then load and save those types through it (api/content.ts), and show only what it supports
// (no history without `revisions`). The app's own pages render that content; `preview` says where.
import type { ContentRef, DefinedContentAdapter, EditState } from '../shared/adapter'

export interface AdapterTypes {
  /** The collections the adapter serves, by name: not ones defined in server/atelier/. */
  collections?: string[]
  singletons?: string[]
  /** The page that shows this content, for the visual editor's preview (none: no visual editing). */
  preview?: (ref: ContentRef, state: EditState) => string | undefined
}

export interface AdapterType extends Omit<AdapterTypes, 'collections' | 'singletons'> {
  adapter: DefinedContentAdapter
  kind: 'collection' | 'singleton'
}

const served = new Map<string, AdapterType>()

/**
 * Lets `adapter` serve these types: call it from a Nitro plugin. Names must not be types defined in
 * server/atelier/, nor ones another adapter serves.
 */
export function registerContentAdapter(adapter: DefinedContentAdapter, types: AdapterTypes): void {
  for (const [kind, names] of [['collection', types.collections ?? []], ['singleton', types.singletons ?? []]] as const) {
    for (const name of names) {
      if (served.has(name))
        throw new Error(`[nuxt-atelier] "${name}" is already served by the "${served.get(name)!.adapter.name}" content adapter`)
      served.set(name, { adapter, kind, preview: types.preview })
    }
  }
}

/** The adapter serving a type, if one does. */
export const adapterFor = (name: string): AdapterType | undefined => served.get(name)

/** Every type adapters serve, by name. */
export const adapterTypes = (): ReadonlyMap<string, AdapterType> => served
