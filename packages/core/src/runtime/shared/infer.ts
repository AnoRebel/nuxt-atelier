// Entry types inferred from field descriptors, and the registry the module's generated types fill in.
import type { Field, Fields } from './fields'

export interface RichTextDocument {
  type: 'doc'
  content?: { type: string, [key: string]: unknown }[]
}
export interface BlockInstance {
  id: string
  type: string
  props: Record<string, unknown>
}
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

type OptionValue<O> = O extends { value: infer V } ? V : O

/** The stored value type of one field. */
export type FieldValue<F extends Field>
  = F extends { 'type': 'custom', '~value'?: infer T } ? T
    : F extends { type: 'number' } ? number
      : F extends { type: 'boolean' } ? boolean
        : F extends { type: 'richText' } ? RichTextDocument
          : F extends { type: 'json' } ? JsonValue
            : F extends { type: 'select', options: readonly (infer O)[] } ? OptionValue<O>
              : F extends { type: 'multiSelect', options: readonly (infer O)[] } ? OptionValue<O>[]
                : F extends { type: 'relation', many: true } ? string[]
                  : F extends { type: 'object', fields: infer S extends Fields } ? InferEntry<S>
                    : F extends { type: 'repeater', fields: infer S extends Fields } ? InferEntry<S>[]
                      : F extends { type: 'blocks' } ? BlockInstance[]
                        : string // text, textarea, date, email, url, slug, color, media, relation

type Prettify<T> = { [K in keyof T]: T[K] } & {}

/** The data of an entry with these fields. Fields without `required: true` may be missing or null. */
export type InferEntry<S extends Fields> = Prettify<
  // -readonly: descriptors are inferred as const, but entry data is editable
  { -readonly [K in keyof S as S[K] extends { required: true } ? K : never]: FieldValue<S[K]> }
  & { -readonly [K in keyof S as S[K] extends { required: true } ? never : K]?: FieldValue<S[K]> | null }
>

/** Filled in by the module's generated types: every collection and singleton definition, by name. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging
export interface AtelierCollections {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging
export interface AtelierSingletons {}

/** The data of an entry in a collection, e.g. `CollectionEntry<'articles'>`. */
export type CollectionEntry<N extends keyof AtelierCollections>
  = AtelierCollections[N] extends { fields: infer S extends Fields } ? InferEntry<S> : never

/** The data of a singleton, e.g. `SingletonEntry<'settings'>`. */
export type SingletonEntry<N extends keyof AtelierSingletons>
  = AtelierSingletons[N] extends { fields: infer S extends Fields } ? InferEntry<S> : never
