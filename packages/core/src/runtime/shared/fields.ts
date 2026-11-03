// Field helpers: each returns a plain descriptor. `fieldSchema()` derives the Valibot schema from a
// descriptor, so the admin and the server validate with the same rules. Everything except a custom
// `validate` is JSON-serialisable.
import * as v from 'valibot'

/** Any Standard Schema (Valibot, Zod, ArkType, …): https://standardschema.dev */
export interface StandardSchema {
  readonly '~standard': {
    validate: (value: unknown) => StandardResult | Promise<StandardResult>
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
}
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
export interface RichTextField extends Base { type: 'richText' }
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
/** Stores the id (or ids, with `many`) of entries in the `to` collection. */
export interface RelationField extends Base, Items { type: 'relation', to: string, many?: boolean }
export interface ObjectField extends Base { type: 'object', fields: Fields }
export interface RepeaterField extends Base, Items { type: 'repeater', fields: Fields }
/** `allow`: block names that may be added; all blocks when omitted. */
export interface BlocksField extends Base, Items { type: 'blocks', allow?: readonly string[] }

export type Field
  = | TextField | TextareaField | RichTextField | NumberField | BooleanField | SelectField
    | MultiSelectField | DateField | EmailField | UrlField | SlugField | ColorField | JsonField
    | MediaField | RelationField | ObjectField | RepeaterField | BlocksField

type Options<F extends Field> = Omit<F, 'type'>

// `const` generics keep literal options (`required: true`, select values, `many: true`) so entry types can be inferred
const helper = <F extends Field>(type: F['type']) =>
  <const O extends Options<F>>(options?: O): F & O & { type: F['type'] } => ({ type, ...options }) as F & O

export const text = helper<TextField>('text')
export const textarea = helper<TextareaField>('textarea')
export const richText = helper<RichTextField>('richText')
export const number = helper<NumberField>('number')
export const boolean = helper<BooleanField>('boolean')
export const select = <const O extends Options<SelectField>>(options: O): SelectField & O => ({ type: 'select', ...options })
export const multiSelect = <const O extends Options<MultiSelectField>>(options: O): MultiSelectField & O => ({ type: 'multiSelect', ...options })
export const date = helper<DateField>('date')
export const email = helper<EmailField>('email')
export const url = helper<UrlField>('url')
export const slug = helper<SlugField>('slug')
export const color = helper<ColorField>('color')
export const json = helper<JsonField>('json')
export const media = helper<MediaField>('media')
export const relation = <const O extends Options<RelationField>>(options: O): RelationField & O => ({ type: 'relation', ...options })
export const object = <const O extends Options<ObjectField>>(options: O): ObjectField & O => ({ type: 'object', ...options })
export const repeater = <const O extends Options<RepeaterField>>(options: O): RepeaterField & O => ({ type: 'repeater', ...options })
export const blocks = helper<BlocksField>('blocks')

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

const proseNode: v.GenericSchema = v.looseObject({
  type: v.string(),
  content: v.optional(v.array(v.lazy(() => proseNode))),
})

const builders: { [T in Field['type']]: (field: Extract<Field, { type: T }>) => Schema } = {
  text: f => str('expected text', ...length(f), ...f.pattern === undefined
    ? []
    : [v.regex(new RegExp(`^(?:${f.pattern})$`, 'u'), f.patternMessage ?? `expected to match ${f.pattern}`)]),
  textarea: f => str('expected text', ...length(f)),
  richText: () => v.looseObject({ type: v.literal('doc', 'expected a rich text document'), content: v.optional(v.array(proseNode)) }, 'expected a rich text document'),
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
  object: f => entrySchema(f.fields),
  repeater: f => pipe(v.arrayAsync(entrySchema(f.fields), 'expected a list'), ...items(f)),
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
  if (field.unique && CAPPED_WHEN_UNIQUE.has(field.type) && (field as Length).maxLength === undefined)
    schema = pipe(schema, v.maxLength(UNIQUE_MAX_LENGTH, `expected at most ${UNIQUE_MAX_LENGTH} characters`))
  if (field.validate) {
    const custom = field.validate
    schema = v.pipeAsync(schema, v.rawCheckAsync(async ({ dataset, addIssue }) => {
      if (!dataset.typed)
        return
      const result = await custom['~standard'].validate(dataset.value)
      for (const issue of result.issues ?? [])
        addIssue({ message: issue.message })
    }))
  }
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

/** The schema for a whole entry (or object / repeater item): known fields only, missing ones are empty. */
export function entrySchema(fields: Fields): Schema {
  const keys = Object.keys(fields)
  return v.pipeAsync(
    v.custom<Record<string, unknown>>(isPlainObject, 'expected an object'),
    v.transform(input => ({ ...Object.fromEntries(keys.map(k => [k, undefined])), ...input })),
    v.strictObjectAsync(Object.fromEntries(keys.map(k => [k, fieldSchema(fields[k]!)])), 'expected an object'),
  )
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
}

/** Validates entry data against its fields, collecting every failing field path and reason. */
export async function validateEntry(fields: Fields, data: unknown, options: ValidateOptions = {}): Promise<ValidationResult> {
  const result = await v.safeParseAsync(entrySchema(fields), data)
  if (!result.success)
    return { success: false, errors: result.issues.map(issueToError) }

  const errors: FieldError[] = []
  for (const [key, field] of Object.entries(fields)) {
    const value = (result.output as Record<string, unknown>)[key]
    if (!field.unique || isEmpty(value))
      continue
    if (!options.isUnique)
      throw new Error(`Field "${key}" is unique, but no isUnique check was given`)
    if (!await options.isUnique(key, value))
      errors.push({ path: key, message: 'already used by another entry' })
  }
  return errors.length ? { success: false, errors } : { success: true, value: result.output as Record<string, unknown> }
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
