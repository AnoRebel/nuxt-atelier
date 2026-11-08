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
