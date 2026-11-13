// Public forms: their definitions (the built-in `atelier-forms` collection) and the rules a submission
// meets, the same in the browser and on the server.
import * as v from 'valibot'

export const FORMS = 'atelier-forms'
export const FORM_FIELD_TYPES = ['text', 'email', 'textarea', 'number', 'select', 'checkbox', 'radio', 'date', 'file', 'hidden', 'consent'] as const
type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

export interface FormField {
  name: string
  type: FormFieldType
  label: string
  /** The label in other locales: `{ de: 'Name' }`. */
  labels?: Record<string, string> | null
  help?: string | null
  placeholder?: string | null
  required?: boolean | null
  /** select and radio: one per line, `value` or `value|Label`. */
  options?: string | null
  /** number: the range; text, textarea: the length. */
  min?: number | null
  max?: number | null
  /** text: a regular expression the whole value matches. */
  pattern?: string | null
  /** file: accepted types (`image/*, application/pdf`), and the largest size in MB. */
  accept?: string | null
  maxSize?: number | null
  /** hidden: its value. */
  value?: string | null
}

export interface FormDefinition {
  title: string
  fields: FormField[]
  submitLabel?: string | null
  success?: { message?: string | null, redirect?: string | null } | null
  notify?: { to?: string | null, subject?: string | null } | null
  confirmation?: { enabled?: boolean | null, subject?: string | null, message?: string | null } | null
  retentionDays?: number | null
}

const NAME_RE = /^[a-z][\w-]{0,63}$/i
/** Names the form block itself sends (spam checks, locale): no field may use them. */
const RESERVED = new Set(['_hp', '_token', '_locale', '_challenge'])

/** A field's label in `locale`, else its default. */
export const labelOf = (field: FormField, locale?: string) => (locale && field.labels?.[locale]) || field.label

/** select and radio options, from their one-per-line text. */
export function optionsOf(field: FormField): { value: string, label: string }[] {
  return (field.options ?? '').split('\n').map(line => line.trim()).filter(Boolean).map((line) => {
    const [value, label] = line.split('|')
    return { value: value!.trim(), label: (label ?? value)!.trim() }
  })
}

/** What's wrong with a definition: names, options, ranges and patterns. */
export function definitionErrors(definition: Partial<FormDefinition>): { path: string, message: string }[] {
  const errors: { path: string, message: string }[] = []
  const names = new Set<string>()
  ;(definition.fields ?? []).forEach((field, i) => {
    const at = `fields.${i}`
    if (!NAME_RE.test(field.name ?? '') || RESERVED.has(field.name))
      errors.push({ path: `${at}.name`, message: 'use letters, digits, "_" and "-", starting with a letter' })
    else if (names.has(field.name))
      errors.push({ path: `${at}.name`, message: `"${field.name}" is used twice` })
    names.add(field.name)
    if (!FORM_FIELD_TYPES.includes(field.type))
      errors.push({ path: `${at}.type`, message: `expected one of ${FORM_FIELD_TYPES.join(', ')}` })
    if ((field.type === 'select' || field.type === 'radio') && !optionsOf(field).length)
      errors.push({ path: `${at}.options`, message: 'add at least one option, one per line' })
    if (field.min != null && field.max != null && field.min > field.max)
      errors.push({ path: `${at}.max`, message: 'is less than the minimum' })
    if (field.pattern) {
      try {
        new RegExp(field.pattern)
      }
      catch {
        errors.push({ path: `${at}.pattern`, message: 'isn\'t a valid regular expression' })
      }
    }
  })
  if (!names.size)
    errors.push({ path: 'fields', message: 'add at least one field' })
  const redirect = definition.success?.redirect
  if (redirect && !redirect.startsWith('/') && !/^https?:\/\//.test(redirect))
    errors.push({ path: 'success.redirect', message: 'expected a path on this site (/thanks) or a full URL' })
  return errors
}

/** One field's rule (files: their name, type and size are checked where they arrive). */
function fieldRule(field: FormField): v.GenericSchema {
  const optional = (schema: v.GenericSchema) => field.required ? schema : v.optional(v.union([v.literal(''), v.null(), schema]))
  switch (field.type) {
    case 'email':
      return optional(v.pipe(v.string(), v.trim(), v.nonEmpty('required'), v.email('expected an email address'), v.maxLength(254)))
    case 'number': {
      const checks: v.PipeItem<number, number, v.BaseIssue<unknown>>[] = []
      if (field.min != null)
        checks.push(v.minValue(field.min, `at least ${field.min}`))
      if (field.max != null)
        checks.push(v.maxValue(field.max, `at most ${field.max}`))
      return optional(v.pipe(v.union([v.number(), v.pipe(v.string(), v.nonEmpty('required'), v.transform(Number))]), v.number('expected a number'), ...checks))
    }
    case 'select':
    case 'radio':
      return optional(v.picklist(optionsOf(field).map(o => o.value), 'choose one of the options'))
    case 'checkbox':
      return field.required ? v.literal(true, 'required') : v.optional(v.boolean(), false)
    case 'consent':
      return field.required ? v.literal(true, 'your consent is required') : v.optional(v.boolean(), false)
    case 'date':
      return optional(v.pipe(v.string(), v.nonEmpty('required'), v.isoDate('expected a date')))
    case 'file':
      return v.optional(v.any())
    case 'hidden':
      return v.optional(v.string())
    default: {
      const max = field.max ?? (field.type === 'textarea' ? 10_000 : 500)
      return optional(v.pipe(
        v.string(),
        v.trim(),
        v.nonEmpty('required'),
        v.maxLength(max, `at most ${max} characters`),
        v.minLength(field.min ?? 0, `at least ${field.min} characters`),
        v.regex(field.pattern ? new RegExp(`^(?:${field.pattern})$`) : /[\s\S]*/, 'doesn\'t have the expected format'),
      ))
    }
  }
}

/** The rules of a submission's values, by field name; other keys are dropped. */
export function submissionSchema(definition: Pick<FormDefinition, 'fields'>) {
  return v.object(Object.fromEntries(definition.fields.map(field => [field.name, fieldRule(field)])))
}

/** A file field's problem with a file, if any: its type or size. */
export function fileProblem(field: FormField, file: { name: string, type: string, size: number }): string | undefined {
  const max = (field.maxSize ?? 10) * 1024 * 1024
  if (file.size > max)
    return `larger than ${field.maxSize ?? 10} MB`
  const accepted = (field.accept ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
  const ok = !accepted.length || accepted.some(a => a.startsWith('.')
    ? file.name.toLowerCase().endsWith(a)
    : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a)
  return ok ? undefined : `expected ${accepted.join(', ')}`
}

/** Values that are emails, for erasure requests: lowercased. */
export const emailsOf = (definition: Pick<FormDefinition, 'fields'>, values: Record<string, unknown>) =>
  definition.fields.filter(f => f.type === 'email' && typeof values[f.name] === 'string' && values[f.name]).map(f => String(values[f.name]).toLowerCase())
