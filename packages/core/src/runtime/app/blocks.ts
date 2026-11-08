// Block authoring from `#atelier`: `defineBlock()` and the field helpers typed as Vue props, so
// `defineProps({ title: text({ required: true }) })` gives the component a typed `title` prop.
// At build time the schema is read from source and the helpers are rewritten to plain props; these
// runtime values only matter where that rewrite doesn't run (tests, `.block.ts` files).
import type { PropType } from 'vue'
import type * as F from '../shared/fields'
import type { AreaRules } from '../shared/blocks'
import type { FieldValue } from '../shared/infer'
import * as fields from '../shared/fields'

/** A field helper's result in `defineProps`: a Vue prop whose value is the field's, plus its descriptor. */
export interface BlockProp<V, D extends F.Field> {
  'type': PropType<V>
  'required': false
  readonly '~field': D
}

type Value<D extends F.Field> = D extends { required: true } ? FieldValue<D> : FieldValue<D> | null
const prop = <D extends F.Field>(field: D): BlockProp<Value<D>, D> =>
  ({ 'type': null as unknown as PropType<Value<D>>, 'required': false, '~field': field })

type O<D extends F.Field> = F.FieldOptions<D>

export const text = <const P extends O<F.TextField>>(options?: P) => prop(fields.text(options))
export const textarea = <const P extends O<F.TextareaField>>(options?: P) => prop(fields.textarea(options))
export const richText = <const P extends O<F.RichTextField>>(options?: P) => prop(fields.richText(options))
export const number = <const P extends O<F.NumberField>>(options?: P) => prop(fields.number(options))
export const boolean = <const P extends O<F.BooleanField>>(options?: P) => prop(fields.boolean(options))
export const select = <const P extends O<F.SelectField>>(options: P) => prop(fields.select(options))
export const multiSelect = <const P extends O<F.MultiSelectField>>(options: P) => prop(fields.multiSelect(options))
export const date = <const P extends O<F.DateField>>(options?: P) => prop(fields.date(options))
export const email = <const P extends O<F.EmailField>>(options?: P) => prop(fields.email(options))
export const url = <const P extends O<F.UrlField>>(options?: P) => prop(fields.url(options))
export const slug = <const P extends O<F.SlugField>>(options?: P) => prop(fields.slug(options))
export const color = <const P extends O<F.ColorField>>(options?: P) => prop(fields.color(options))
export const json = <const P extends O<F.JsonField>>(options?: P) => prop(fields.json(options))
export const media = <const P extends O<F.MediaField>>(options?: P) => prop(fields.media(options))
export const relation = <const P extends O<F.RelationField>>(options: P) => prop(fields.relation(options))
export const object = <const P extends O<F.ObjectField>>(options: P) => prop(fields.object(options))
export const repeater = <const P extends O<F.RepeaterField>>(options: P) => prop(fields.repeater(options))
export const blocks = <const P extends O<F.BlocksField>>(options?: P) => prop(fields.blocks(options))

type Helper = BlockProp<unknown, F.Field>

export interface BlockMeta {
  /** PascalCase; defaults to the file name (`pricing-table.vue` → `PricingTable`). */
  name?: string
  label?: string
  description?: string
  /** For pickers and placement rules (`group:<name>`). */
  group?: string
  /** For placement rules (`tag:<name>`). */
  tags?: string[]
  icon?: string
  /** Presentation options (variant, spacing…), passed to the component as props. */
  options?: Record<string, Helper>
  /** Nested block lists, each rendered through the component's slot of the same name. */
  areas?: Record<string, AreaRules>
  editor?: { proxy?: boolean }
}

/** A `.block.ts` block: any component, with its fields declared here. */
export interface BlockFile extends BlockMeta {
  component: unknown
  fields?: Record<string, Helper>
}

/**
 * Declares a block. In a `.vue` block, call it in `<script setup>` with the block's metadata (its
 * fields are the field helpers in `defineProps`). In a `.block.ts` file, pass `component` and `fields`.
 * Read at build time: use literal values only.
 */
export function defineBlock<const T extends BlockMeta | BlockFile>(definition: T): T {
  return definition
}
