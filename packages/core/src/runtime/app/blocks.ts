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

/** A single line of text: `text({ required: true, maxLength: 120 })`. As a block prop: its value is the prop's. */
export const text = <const P extends O<F.TextField>>(options?: P) => prop(fields.text(options))
/** Plain text over several lines. As a block prop: its value is the prop's. */
export const textarea = <const P extends O<F.TextareaField>>(options?: P) => prop(fields.textarea(options))
/** Formatted text, stored as a ProseMirror document and sanitized on save; render it with `<AtelierRichText>`. As a block prop: its value is the prop's. */
export const richText = <const P extends O<F.RichTextField>>(options?: P) => prop(fields.richText(options))
/** A number; `integer`, `min` and `max` constrain it. As a block prop: its value is the prop's. */
export const number = <const P extends O<F.NumberField>>(options?: P) => prop(fields.number(options))
/** True or false: a switch in the admin. As a block prop: its value is the prop's. */
export const boolean = <const P extends O<F.BooleanField>>(options?: P) => prop(fields.boolean(options))
/** One value from a list of `options`. As a block prop: its value is the prop's. */
export const select = <const P extends O<F.SelectField>>(options: P) => prop(fields.select(options))
/** Several values from a list of `options`. As a block prop: its value is the prop's. */
export const multiSelect = <const P extends O<F.MultiSelectField>>(options: P) => prop(fields.multiSelect(options))
/** A date (`YYYY-MM-DD`), a date and time (`mode: 'datetime'`, ISO 8601 UTC) or a time (`mode: 'time'`). As a block prop: its value is the prop's. */
export const date = <const P extends O<F.DateField>>(options?: P) => prop(fields.date(options))
/** An email address, checked on save. As a block prop: its value is the prop's. */
export const email = <const P extends O<F.EmailField>>(options?: P) => prop(fields.email(options))
/** A web address, or a path on the site. As a block prop: its value is the prop's. */
export const url = <const P extends O<F.UrlField>>(options?: P) => prop(fields.url(options))
/** A URL-safe name, made from another field with `from` (`slug({ from: 'title' })`). As a block prop: its value is the prop's. */
export const slug = <const P extends O<F.SlugField>>(options?: P) => prop(fields.slug(options))
/** A colour, as a hex value. As a block prop: its value is the prop's. */
export const color = <const P extends O<F.ColorField>>(options?: P) => prop(fields.color(options))
/** Any JSON value, edited as JSON. As a block prop: its value is the prop's. */
export const json = <const P extends O<F.JsonField>>(options?: P) => prop(fields.json(options))
/** A file from the media library (`many: true` for several). As a block prop: its value is the prop's. */
export const media = <const P extends O<F.MediaField>>(options?: P) => prop(fields.media(options))
/** A link to entries of another collection: `relation({ to: 'authors' })`, `many: true` for several. As a block prop: its value is the prop's. */
export const relation = <const P extends O<F.RelationField>>(options: P) => prop(fields.relation(options))
/** A group of `fields`, stored together. As a block prop: its value is the prop's. */
export const object = <const P extends O<F.ObjectField>>(options: P) => prop(fields.object(options))
/** A list of items, each with the same `fields`. As a block prop: its value is the prop's. */
export const repeater = <const P extends O<F.RepeaterField>>(options: P) => prop(fields.repeater(options))
/** A list of blocks, with `allow`, `minItems` and `maxItems` to constrain it. As a block prop: its value is the prop's. */
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
