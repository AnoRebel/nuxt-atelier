// Field helpers: each returns a plain descriptor. `fieldSchema()` derives the Valibot schema from a
// descriptor, so the admin and the server validate with the same rules. Everything except a custom
// `validate` is JSON-serialisable.
import type { AreaRules, BlockSchema } from './blocks'
import { SHARED_BLOCK } from './blocks'
import * as v from 'valibot'
import { sanitizeRichText } from './rich-text'

/** Any Standard Schema (Valibot, Zod, ArkType, …): https://standardschema.dev */
export interface StandardSchema {
  readonly '~standard': {
    validate: (value: unknown) => StandardResult | Promise<StandardResult>
    readonly types?: { readonly output: unknown }
  }
}
type StandardResult = { issues?: undefined } | { issues: readonly { message: string }[] }

interface Base {
  label?: string
  /** Help text shown under the input. */
  help?: string
  /** Must have a value: not empty, and for lists at least one item. */
  required?: boolean
  /** No two entries may have the same value. Top-level fields only. */
  unique?: boolean
  /** Extra validation with any Standard Schema. Runs on the server only; not serialisable. */
  validate?: StandardSchema
  /** Initial value for new entries and blocks (JSON). Each one gets its own copy. */
  default?: unknown
  /**
   * The field's previous key, when it was renamed: its stored data moves to the new key instead of
   * being dropped. Top-level fields only.
   */
  renamedFrom?: string
  /**
   * In a localized type: one value for every locale, not translated. Saving it in one locale's version
   * changes it in the others. Top-level fields only.
   */
  shared?: boolean
  /**
   * Found by site search, with a weight: 3 counts most (a title), 1 least (body text); `true` is 1. On an
   * object, repeater or blocks field, all the text inside it is searched, the blocks' own fields included.
   */
  searchable?: boolean | 1 | 2 | 3
  /**
   * Only applies while this holds: otherwise the field is hidden in the admin, not required, and not stored.
   * `field` names a sibling (in the same object or repeater item), or a top-level field with a leading `/`.
   */
  when?: Condition
}

/** A condition on another field's value: equal to, not equal to, one of, or set (not empty). */
export type Condition = { field: string } & ({ eq: unknown } | { ne: unknown } | { in: readonly unknown[] } | { set: boolean })
interface Length { minLength?: number, maxLength?: number }
interface Items { minItems?: number, maxItems?: number }

type Option = string | { readonly value: string, readonly label?: string }
export type Fields = Record<string, Field>

export interface TextField extends Base, Length {
  type: 'text'
  /** A regular expression (source string) the whole value must match. */
  pattern?: string
  /** Shown when `pattern` doesn't match. */
  patternMessage?: string
}
export interface TextareaField extends Base, Length { type: 'textarea', rows?: number }
export interface RichTextField extends Base {
  type: 'richText'
  /** Custom node types (Tiptap extensions) kept on save; others are removed (see shared/rich-text.ts). */
  nodes?: readonly string[]
  /** Custom mark types kept on save. */
  marks?: readonly string[]
}
export interface NumberField extends Base { type: 'number', integer?: boolean, min?: number, max?: number }
export interface BooleanField extends Base { type: 'boolean' }
export interface SelectField extends Base { type: 'select', options: readonly Option[] }
export interface MultiSelectField extends Base, Items { type: 'multiSelect', options: readonly Option[] }
/** `date`: `YYYY-MM-DD`; `datetime`: ISO 8601 UTC (`2026-11-03T09:30:00Z`); `time`: `HH:MM`. */
export interface DateField extends Base { type: 'date', mode?: 'date' | 'datetime' | 'time' }
export interface EmailField extends Base, Length { type: 'email' }
export interface UrlField extends Base, Length { type: 'url' }
/** `from`: the field the admin derives the slug from. */
export interface SlugField extends Base, Length { type: 'slug', from?: string }
export interface ColorField extends Base { type: 'color', alpha?: boolean }
export interface JsonField extends Base { type: 'json' }
/** Stores a media item id. `accept`: MIME patterns like `image/*`. */
export interface MediaField extends Base { type: 'media', accept?: readonly string[] }
/**
 * Stores the id (or ids, with `many`) of entries in the `to` collection. `onDelete` says what happens
 * to this entry when a referenced one is deleted: `restrict` (the default) refuses the deletion,
 * `nullify` removes the reference, `cascade` deletes this entry too (not allowed in singletons).
 */
export interface RelationField extends Base, Items {
  type: 'relation'
  to: string
  many?: boolean
  onDelete?: 'restrict' | 'nullify' | 'cascade'
  /**
   * The relation field on `to` pointing back, which must name this field as its own inverse: the two are
   * kept in sync, whichever side is edited. Top-level relations of collections only.
   */
  inverse?: string
}
export interface ObjectField extends Base { type: 'object', fields: Fields }
export interface RepeaterField extends Base, Items { type: 'repeater', fields: Fields }
/** `allow`: block names that may be added; all blocks when omitted. */
export interface BlocksField extends Base, Items { type: 'blocks', allow?: readonly string[] }

/** How a custom field's value is stored: a string, a number, a boolean, or JSON. */
export type FieldStorage = 'text' | 'number' | 'boolean' | 'json'

/** A field of a type made with `defineFieldType`. `T` is its value's type. */
export interface CustomField<T = unknown> extends Base {
  'type': 'custom'
  /** The field type's name, e.g. `geo-point`. */
  'fieldType': string
  'storage': FieldStorage
  /** The admin input: the name of a global Vue component. */
  'input'?: string
  /** Validates the value. Runs on the server only; not serialisable. */
  'schema': StandardSchema
  readonly '~value'?: T
}

export type Field
  = | TextField | TextareaField | RichTextField | NumberField | BooleanField | SelectField
    | MultiSelectField | DateField | EmailField | UrlField | SlugField | ColorField | JsonField
    | MediaField | RelationField | ObjectField | RepeaterField | BlocksField | CustomField

export type FieldOptions<F extends Field> = Omit<F, 'type'>
type Options<F extends Field> = FieldOptions<F>

// `const` generics keep literal options (`required: true`, select values, `many: true`) so entry types can be inferred
const helper = <F extends Field>(type: F['type']) =>
  <const O extends Options<F>>(options?: O): F & O & { type: F['type'] } => ({ type, ...options }) as F & O

/** A single line of text: `text({ required: true, maxLength: 120 })`. */
export const text = helper<TextField>('text')
/** Plain text over several lines. */
export const textarea = helper<TextareaField>('textarea')
/** Formatted text, stored as a ProseMirror document and sanitized on save; render it with `<AtelierRichText>`. */
export const richText = helper<RichTextField>('richText')
/** A number; `integer`, `min` and `max` constrain it. */
export const number = helper<NumberField>('number')
/** True or false: a switch in the admin. */
export const boolean = helper<BooleanField>('boolean')
/** One value from a list of `options`. */
export const select = <const O extends Options<SelectField>>(options: O): SelectField & O => ({ type: 'select', ...options })
/** Several values from a list of `options`. */
export const multiSelect = <const O extends Options<MultiSelectField>>(options: O): MultiSelectField & O => ({ type: 'multiSelect', ...options })
/** A date (`YYYY-MM-DD`), a date and time (`mode: 'datetime'`, ISO 8601 UTC) or a time (`mode: 'time'`). */
export const date = helper<DateField>('date')
/** An email address, checked on save. */
export const email = helper<EmailField>('email')
/** A web address, or a path on the site. */
export const url = helper<UrlField>('url')
/** A URL-safe name, made from another field with `from` (`slug({ from: 'title' })`). */
export const slug = helper<SlugField>('slug')
/** `text` as a slug: lowercase ASCII letters and digits, words joined by single hyphens ("Frühjahr 2026!" → "fruhjahr-2026"). */
export const slugify = (text: string): string => text.replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** A colour, as a hex value. */
export const color = helper<ColorField>('color')
/** Any JSON value, edited as JSON. */
export const json = helper<JsonField>('json')
/** A file from the media library (`many: true` for several). */
export const media = helper<MediaField>('media')
/** A link to entries of another collection: `relation({ to: 'authors' })`, `many: true` for several. */
export const relation = <const O extends Options<RelationField>>(options: O): RelationField & O => ({ type: 'relation', ...options })
/** A group of `fields`, stored together. */
export const object = <const O extends Options<ObjectField>>(options: O): ObjectField & O => ({ type: 'object', ...options })
/** A list of items, each with the same `fields`. */
export const repeater = <const O extends Options<RepeaterField>>(options: O): RepeaterField & O => ({ type: 'repeater', ...options })
/** A list of blocks, with `allow`, `minItems` and `maxItems` to constrain it. */
export const blocks = helper<BlocksField>('blocks')

/**
 * Search and social metadata for a routable type's pages: `fields: { seo: seo() }`. Each part falls back
 * when empty: the title to the entry's `title` (or `name`), the description to its `description` (or
 * `excerpt`, `summary`), the image to its `image` (or `cover`), the canonical URL to the page's own.
 */
export const seo = (options: Omit<Options<ObjectField>, 'fields'> = {}) => object({
  label: 'SEO',
  ...options,
  fields: {
    title: text({ label: 'Title', maxLength: 120, help: 'Shown in search results and browser tabs. The page\'s title when empty.' }),
    description: textarea({ label: 'Description', maxLength: 320, help: 'Shown under the title in search results and link previews.' }),
    image: media({ label: 'Sharing image', help: 'Shown when the page is shared: about 1200 × 630.' }),
    canonical: url({ label: 'Canonical URL', help: 'Only when this page copies another: the original\'s URL.' }),
    noindex: boolean({ label: 'Hide from search engines' }),
    nofollow: boolean({ label: 'Tell search engines not to follow its links' }),
  },
})

export interface FieldTypeDefinition<S extends StandardSchema> {
  /** Lowercase letters, digits and `-`, e.g. `geo-point`. */
  name: string
  storage: FieldStorage
  /** Any Standard Schema; its output type is the field's value type. */
  schema: S
  /** The admin input: the name of a global Vue component. */
  input?: string
}

type Output<S extends StandardSchema> = NonNullable<S['~standard']['types']> extends { output: infer T } ? T : unknown
type CustomOptions = Omit<CustomField, 'type' | 'fieldType' | 'storage' | 'schema' | 'input' | '~value'>

/**
 * Defines a field type, returning its helper: `const geoPoint = defineFieldType({ ... })`, then
 * `location: geoPoint({ required: true })` in any collection, singleton, object or repeater.
 */
export function defineFieldType<const S extends StandardSchema>(definition: FieldTypeDefinition<S>) {
  const { name, storage, schema, input } = definition
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new Error(`[nuxt-atelier] Field type "${name}": use lowercase letters, digits and "-", starting with a letter`)
  return <const O extends CustomOptions>(options?: O): CustomField<Output<S>> & O =>
    ({ type: 'custom', fieldType: name, storage, schema, ...input === undefined ? {} : { input }, ...options }) as unknown as CustomField<Output<S>> & O
}

/** JSON for a schema or field descriptors: validators (Standard Schemas) are left out. */
export const serialiseFields = (value: unknown): string =>
  JSON.stringify(value, (_, x) => x && typeof x === 'object' && '~standard' in x ? undefined : x)

// --- schemas -----------------------------------------------------------------

type Schema = v.GenericSchema | v.GenericSchemaAsync
type Action = unknown // a Valibot pipe step

// Valibot types each pipe step against the previous one's output. These pipes are assembled from
// optional steps, so they're typed loosely here; the field descriptor is the source of truth.
const pipe = (schema: Schema, ...actions: Action[]): Schema => v.pipeAsync(schema, ...(actions as []))

const values = (options: readonly Option[]) => options.map(o => typeof o === 'string' ? o : o.value)
const id = v.pipe(v.string('expected an id'), v.nonEmpty('expected an id'))
const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === Object.prototype

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true
  if (typeof value === 'number')
    return Number.isFinite(value)
  if (Array.isArray(value))
    return value.every(isJson)
  return isPlainObject(value) && Object.values(value).every(isJson)
}

const length = (f: Length): Action[] => [
  ...f.minLength === undefined ? [] : [v.minLength(f.minLength, `expected at least ${f.minLength} characters`)],
  ...f.maxLength === undefined ? [] : [v.maxLength(f.maxLength, `expected at most ${f.maxLength} characters`)],
]
const items = (f: Items): Action[] => [
  ...f.minItems === undefined ? [] : [v.minLength(f.minItems, `expected at least ${f.minItems} items`)],
  ...f.maxItems === undefined ? [] : [v.maxLength(f.maxItems, `expected at most ${f.maxItems} items`)],
]
const unique = v.check((list: unknown[]) => new Set(list).size === list.length, 'contains duplicates')
const str = (message: string, ...actions: Action[]) => pipe(v.string(message), ...actions)

const stored: Record<FieldStorage, Schema> = {
  text: v.string('expected text'),
  number: v.pipe(v.number('expected a number'), v.finite('expected a finite number')),
  boolean: v.boolean('expected true or false'),
  json: v.custom(isJson, 'expected a JSON value'),
}

/** A pipe step running a Standard Schema on an already typed value. */
const standard = (schema: StandardSchema) => v.rawCheckAsync(async ({ dataset, addIssue }) => {
  if (!dataset.typed)
    return
  const result = await schema['~standard'].validate(dataset.value)
  for (const issue of result.issues ?? [])
    addIssue({ message: issue.message })
})

const proseNode: v.GenericSchema = v.looseObject({
  type: v.string(),
  content: v.optional(v.array(v.lazy(() => proseNode))),
})

const builders: { [T in Field['type']]: (field: Extract<Field, { type: T }>) => Schema } = {
  text: f => str('expected text', ...length(f), ...f.pattern === undefined
    ? []
    : [v.regex(new RegExp(`^(?:${f.pattern})$`, 'u'), f.patternMessage ?? `expected to match ${f.pattern}`)]),
  textarea: f => str('expected text', ...length(f)),
  // what can't be rendered safely is removed before storage: scripts, `on…` attributes, `javascript:` links
  richText: f => v.pipe(
    v.looseObject({ type: v.literal('doc', 'expected a rich text document'), content: v.optional(v.array(proseNode)) }, 'expected a rich text document'),
    v.transform(doc => sanitizeRichText(doc, f)),
  ),
  number: f => pipe(
    v.number('expected a number'),
    f.integer ? v.integer('expected a whole number') : v.finite('expected a finite number'),
    ...f.min === undefined ? [] : [v.minValue(f.min, `expected ${f.min} or more`)],
    ...f.max === undefined ? [] : [v.maxValue(f.max, `expected ${f.max} or less`)],
  ),
  boolean: () => v.boolean('expected true or false'),
  select: f => v.picklist(values(f.options), `expected one of: ${values(f.options).join(', ')}`),
  multiSelect: f => pipe(
    v.array(v.picklist(values(f.options), `expected one of: ${values(f.options).join(', ')}`), 'expected a list'),
    unique,
    ...items(f),
  ),
  date: ({ mode = 'date' }) => mode === 'datetime'
    ? str('expected a date and time', v.isoTimestamp('expected an ISO 8601 date and time'), v.endsWith('Z', 'expected a UTC time ending in Z'))
    : mode === 'time'
      ? str('expected a time', v.isoTime('expected a time as HH:MM'))
      : str('expected a date', v.isoDate('expected a date as YYYY-MM-DD')),
  email: f => str('expected an email address', v.email('expected an email address'), ...length(f)),
  // http(s) only: a stored `javascript:` URL would be an XSS vector wherever it's rendered as a link
  url: f => str('expected a URL', v.url('expected a URL'), v.regex(/^https?:\/\//i, 'expected an http(s) URL'), ...length(f)),
  slug: f => str('expected a slug', v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected lowercase letters, digits and single hyphens, like "my-page"'), ...length(f)),
  color: f => str('expected a color', f.alpha
    ? v.regex(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i, 'expected a color like #ff8800 or #ff880080')
    : v.regex(/^#[0-9a-f]{6}$/i, 'expected a color like #ff8800')),
  json: () => v.custom(isJson, 'expected a JSON value'),
  media: () => id,
  relation: f => f.many ? pipe(v.array(id, 'expected a list of ids'), unique, ...items(f)) : id,
  object: f => entrySchema(f.fields, true),
  repeater: f => pipe(v.arrayAsync(entrySchema(f.fields, true), 'expected a list'), ...items(f)),
  // the field type's schema is server-only: in the admin (serialised fields) only the storage shape is checked
  custom: f => f.schema ? pipe(stored[f.storage], standard(f.schema)) : stored[f.storage],
  blocks: f => pipe(v.array(v.object({
    id,
    type: f.allow ? v.picklist(f.allow, `expected one of: ${f.allow.join(', ')}`) : v.pipe(v.string('expected a block type'), v.nonEmpty('expected a block type')),
    props: v.record(v.string(), v.unknown(), 'expected block props'),
  }, 'expected a block'), 'expected a list of blocks'), ...items(f)),
}

/** Unique text is indexed, and MySQL only indexes bounded strings: every engine caps it the same way. */
export const UNIQUE_MAX_LENGTH = 255
const CAPPED_WHEN_UNIQUE = new Set<Field['type']>(['text', 'textarea', 'email', 'url', 'slug'])

const isEmpty = (x: unknown) => x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)

/** The Valibot schema for one field's value. */
export function fieldSchema(field: Field): Schema {
  const build = builders[field.type] as ((f: Field) => Schema) | undefined
  if (!build)
    throw new Error(`Unknown field type "${field.type}"`)
  let schema = build(field)
  const capped = CAPPED_WHEN_UNIQUE.has(field.type) || (field.type === 'custom' && field.storage === 'text')
  if (field.unique && capped && (field as Length).maxLength === undefined)
    schema = pipe(schema, v.maxLength(UNIQUE_MAX_LENGTH, `expected at most ${UNIQUE_MAX_LENGTH} characters`))
  if (field.validate)
    schema = pipe(schema, standard(field.validate))
  // Empty values skip the type checks: they pass unless the field is required
  const inner = schema
  return v.pipeAsync(v.unknown(), v.rawTransformAsync(async ({ dataset, addIssue, NEVER }) => {
    if (isEmpty(dataset.value)) {
      if (!field.required)
        return dataset.value
      addIssue({ message: 'required' })
      return NEVER
    }
    const result = await v.safeParseAsync(inner, dataset.value)
    if (result.success)
      return result.output
    for (const issue of result.issues)
      addIssue({ message: messageOf(issue), path: issue.path })
    return NEVER
  }))
}

/**
 * The schema for a whole entry (or object / repeater item): missing fields are empty. Unknown keys are
 * refused at the top level and kept in nested objects (see below).
 */
export function entrySchema(fields: Fields, nested = false): Schema {
  const keys = Object.keys(fields)
  const entries = Object.fromEntries(keys.map(k => [k, fieldSchema(fields[k]!)]))
  return v.pipeAsync(
    v.custom<Record<string, unknown>>(isPlainObject, 'expected an object'),
    v.transform(input => ({ ...Object.fromEntries(keys.map(k => [k, undefined])), ...input })),
    // a key inside an object or repeater item may be left from a removed sub-field: keep it, so the
    // entry still saves (findStaleContent reports it); a top-level unknown key is a mistake
    nested ? v.looseObjectAsync(entries, 'expected an object') : v.strictObjectAsync(entries, 'expected an object'),
  )
}

const hasConditions = (fields: Fields): boolean =>
  Object.values(fields).some(f => !!f.when || ((f.type === 'object' || f.type === 'repeater') && hasConditions(f.fields)))

/** Whether a field's condition holds, with `sibling` the object it's in and `root` the whole entry. */
export function applies(field: Field, sibling: Record<string, unknown>, root: Record<string, unknown>): boolean {
  const when = field.when
  if (!when)
    return true
  const value = when.field.startsWith('/') ? root[when.field.slice(1)] : sibling[when.field]
  if ('eq' in when)
    return same(value, when.eq)
  if ('ne' in when)
    return !same(value, when.ne)
  if ('in' in when)
    return when.in.some(option => same(value, option))
  return when.set === !isEmpty(value)
}
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** A copy of `data` without the values of fields whose condition doesn't hold, in objects and repeaters too. */
function withoutInactive(fields: Fields, data: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
  const inactive = new Set(Object.entries(fields).filter(([, field]) => !applies(field, data, root)).map(([key]) => key))
  const out = Object.fromEntries(Object.entries(data).filter(([key]) => !inactive.has(key)))
  for (const [key, field] of Object.entries(fields)) {
    if (inactive.has(key))
      continue
    const value = data[key]
    if (field.type === 'object' && isPlainObject(value))
      out[key] = withoutInactive(field.fields, value, root)
    else if (field.type === 'repeater' && Array.isArray(value))
      out[key] = value.map(item => isPlainObject(item) ? withoutInactive(field.fields, item, root) : item)
  }
  return out
}

/** The fields with `required` left off conditional ones: whether they're required depends on the data. */
function relaxed(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    let f: Field = field.when && field.required ? { ...field, required: false } : field
    if (f.type === 'object' || f.type === 'repeater')
      f = { ...f, fields: relaxed(f.fields) } as Field
    return [key, f]
  }))
}

/** `required` errors for conditional fields that apply and are empty. */
function conditionalErrors(fields: Fields, data: Record<string, unknown>, root: Record<string, unknown>, prefix = ''): FieldError[] {
  const errors: FieldError[] = []
  for (const [key, field] of Object.entries(fields)) {
    const value = data[key]
    if (field.when && field.required && applies(field, data, root) && isEmpty(value))
      errors.push({ path: `${prefix}${key}`, message: 'required' })
    if (field.type === 'object' && isPlainObject(value))
      errors.push(...conditionalErrors(field.fields, value, root, `${prefix}${key}.`))
    else if (field.type === 'repeater' && Array.isArray(value))
      value.forEach((item, i) => isPlainObject(item) && errors.push(...conditionalErrors(field.fields, item, root, `${prefix}${key}.${i}.`)))
  }
  return errors
}

export interface FieldError {
  /** Dot path to the field, with list indexes: `faq.2.question`. */
  path: string
  message: string
}

export type ValidationResult
  = | { success: true, value: Record<string, unknown> }
    | { success: false, errors: FieldError[] }

export interface ValidateOptions {
  /** Whether no other entry has `value` in `field`. Required when a field is `unique`; storage supplies it. */
  isUnique?: (field: string, value: unknown) => Promise<boolean>
  /** Block schemas by name: blocks fields then check each block's props and nested areas. */
  blocks?: Record<string, BlockSchema>
  /** How deep blocks may nest (default 10). */
  maxNestingDepth?: number
  /** The block type of each shared block referenced (see SHARED_BLOCK): undefined for one that doesn't exist. */
  sharedTypes?: Record<string, string | undefined>
}

/** Validates entry data against its fields, collecting every failing field path and reason. */
export async function validateEntry(fields: Fields, data: unknown, options: ValidateOptions = {}): Promise<ValidationResult> {
  // conditional fields: inactive ones dropped before validating, active required ones checked after
  const conditional = hasConditions(fields)
  const input = conditional && isPlainObject(data) ? withoutInactive(fields, data, data) : data
  const result = await v.safeParseAsync(entrySchema(conditional ? relaxed(fields) : fields), input)
  if (!result.success)
    return { success: false, errors: result.issues.map(issueToError) }

  const errors: FieldError[] = conditional ? conditionalErrors(fields, result.output as Record<string, unknown>, result.output as Record<string, unknown>) : []
  for (const [key, field] of Object.entries(fields)) {
    const value = (result.output as Record<string, unknown>)[key]
    if (!field.unique || isEmpty(value))
      continue
    if (!options.isUnique)
      throw new Error(`Field "${key}" is unique, but no isUnique check was given`)
    if (!await options.isUnique(key, value))
      errors.push({ path: key, message: 'already used by another entry' })
  }
  if (options.blocks)
    errors.push(...await blockErrors(fields, result.output as Record<string, unknown>, options.blocks, options.maxNestingDepth ?? 10, options.sharedTypes))
  return errors.length ? { success: false, errors } : { success: true, value: result.output as Record<string, unknown> }
}

/** Whether a block may go in an area: not denied, and allowed (by name, `group:<g>` or `tag:<t>`). */
export function placeable(type: string, schema: BlockSchema | undefined, rules: AreaRules): boolean {
  const matches = (pattern: string) => pattern === type
    || (pattern.startsWith('group:') && schema?.group === pattern.slice(6))
    || (pattern.startsWith('tag:') && (schema?.tags ?? []).includes(pattern.slice(4)))
  return !rules.deny?.some(matches) && (!rules.allow || rules.allow.some(matches))
}

interface BlockValue { id: string, type: string, props: Record<string, unknown> }

/**
 * Errors in the block lists of entry data: each known block's fields and options, and its nested
 * areas' placement rules, item counts and depth. Unknown block types and props no longer in a block's
 * schema are kept as they are, so stale content still saves.
 */
async function blockErrors(fields: Fields, data: Record<string, unknown>, registry: Record<string, BlockSchema>, maxDepth: number, sharedTypes?: Record<string, string | undefined>): Promise<FieldError[]> {
  const errors: FieldError[] = []
  const ids = new Set<string>()

  const list = async (blocks: BlockValue[], path: string, depth: number, area?: { name: string, rules: AreaRules, parent: string }) => {
    // an empty area past the deepest level holds nothing too deep
    if (depth > maxDepth && blocks.length) {
      errors.push({ path, message: `blocks nest at most ${maxDepth} levels deep` })
      return
    }
    if (area?.rules.min !== undefined && blocks.length < area.rules.min)
      errors.push({ path, message: `area "${area.name}" of ${area.parent} needs at least ${area.rules.min} blocks` })
    if (area?.rules.max !== undefined && blocks.length > area.rules.max)
      errors.push({ path, message: `area "${area.name}" of ${area.parent} takes at most ${area.rules.max} blocks` })
    for (const [i, block] of blocks.entries()) {
      const at = `${path}.${i}`
      if (ids.has(block.id))
        errors.push({ path: `${at}.id`, message: `the block id "${block.id}" is used twice` })
      ids.add(block.id)
      // a shared block's reference: placed as the block it stands for, its content checked where it's kept
      if (block.type === SHARED_BLOCK) {
        const ref = block.props.ref
        const type = typeof ref === 'string' ? sharedTypes?.[ref] : undefined
        if (!type)
          errors.push({ path: `${at}.props.ref`, message: typeof ref === 'string' ? `no shared block "${ref}"` : 'expected a shared block id' })
        else if (area && !placeable(type, registry[type], area.rules))
          errors.push({ path: at, message: `"${type}" can't be placed in area "${area.name}" of ${area.parent}` })
        continue
      }
      const schema = registry[block.type]
      if (area && !placeable(block.type, schema, area.rules))
        errors.push({ path: at, message: `"${block.type}" can't be placed in area "${area.name}" of ${area.parent}` })
      if (!schema)
        continue
      for (const [key, field] of Object.entries({ ...schema.fields, ...schema.options })) {
        const result = await v.safeParseAsync(fieldSchema(field), block.props[key])
        if (!result.success)
          errors.push(...result.issues.map(issue => ({ path: [`${at}.props.${key}`, v.getDotPath(issue)].filter(Boolean).join('.'), message: messageOf(issue) })))
      }
      for (const [name, rules] of Object.entries(schema.areas)) {
        const nested = block.props[name] ?? [] // an area added since: empty
        if (!Array.isArray(nested) || !nested.every(b => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.type === 'string' && b.props && typeof b.props === 'object'))
          errors.push({ path: `${at}.props.${name}`, message: 'expected a list of blocks' })
        else
          await list(nested, `${at}.props.${name}`, depth + 1, { name, rules, parent: block.type })
      }
    }
  }

  const walk = async (defs: Fields, value: Record<string, unknown> | undefined, prefix: string) => {
    for (const [key, field] of Object.entries(defs)) {
      const v2 = value?.[key]
      if (field.type === 'blocks' && Array.isArray(v2))
        await list(v2 as BlockValue[], `${prefix}${key}`, 1)
      else if (field.type === 'object' && v2 && typeof v2 === 'object')
        await walk(field.fields, v2 as Record<string, unknown>, `${prefix}${key}.`)
      else if (field.type === 'repeater' && Array.isArray(v2))
        for (const [i, item] of v2.entries()) await walk(field.fields, item, `${prefix}${key}.${i}.`)
    }
  }
  await walk(fields, data, '')
  return errors
}

function issueToError(issue: v.BaseIssue<unknown>): FieldError {
  return { path: v.getDotPath(issue) ?? '', message: messageOf(issue) }
}

// A strict object reports an unknown key with the object's own message; say what's actually wrong
const messageOf = (issue: v.BaseIssue<unknown>) =>
  issue.type === 'strict_object' && issue.expected === 'never' ? 'unknown field' : issue.message

/**
 * A factory for fresh default values: every call returns a new deep copy, so an array or object
 * default is never shared between entries or blocks. Object fields get their nested defaults.
 */
export function defaultsFactory(fields: Fields): () => Record<string, unknown> {
  const template: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined)
      template[key] = field.default
    else if (field.type === 'object')
      template[key] = defaultsFactory(field.fields)()
  }
  const frozen = structuredClone(template) // later edits to the descriptor don't leak in either
  return () => structuredClone(frozen)
}
