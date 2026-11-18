// Public forms editors build: their fields and rules, what happens after a submission, and how long
// submissions are kept. Placed with the form block or <AtelierForm>; checked by definitionErrors.
// Each field's settings show only for the types that use them (shared/forms.ts's rules).
import * as v from 'valibot'
import { boolean, defineCollection, defineFieldType, number, object, repeater, select, text, textarea } from '../../../../../server/define'
import { FORM_FIELD_TYPES } from '../../../../../shared/forms'

/** A text per locale (`{ de: 'Name' }`): the admin shows one input for each locale but the default. */
const localeTexts = defineFieldType({
  name: 'locale-texts',
  storage: 'json',
  schema: v.nullish(v.record(v.string(), v.nullish(v.string()))),
})
const forTypes = (...types: (typeof FORM_FIELD_TYPES)[number][]) => ({ when: { field: 'type', in: types } })
const ALL_BUT_HIDDEN = FORM_FIELD_TYPES.filter(type => type !== 'hidden')

export default defineCollection({
  versioned: true,
  labels: { singular: 'Form', plural: 'Forms' },
  admin: { icon: 'file-text', columns: ['title'] },
  fields: {
    title: text({ required: true, maxLength: 120 }),
    fields: repeater({
      fields: {
        label: text({ required: true, maxLength: 300 }),
        name: text({ required: true, maxLength: 64, help: 'The name submissions are stored under: letters, digits, "_" and "-"' }),
        type: select({ options: [...FORM_FIELD_TYPES], required: true, default: 'text' }),
        labels: localeTexts({ label: 'Label in other languages' }),
        help: text({ ...forTypes(...ALL_BUT_HIDDEN), help: 'Shown under the field' }),
        placeholder: text(forTypes('text', 'email', 'textarea', 'number')),
        required: boolean(forTypes(...ALL_BUT_HIDDEN)),
        options: textarea({ ...forTypes('select', 'radio'), help: 'One per line: a value, or value|Label' }),
        min: number({ ...forTypes('number', 'text', 'textarea'), label: 'Minimum', help: 'The smallest number, or the fewest characters' }),
        max: number({ ...forTypes('number', 'text', 'textarea'), label: 'Maximum', help: 'The largest number, or the most characters' }),
        pattern: text({ ...forTypes('text', 'textarea'), help: 'A regular expression the whole answer must match' }),
        accept: text({ ...forTypes('file'), label: 'Accepted files', help: 'Types, like image/*, application/pdf' }),
        maxSize: number({ ...forTypes('file'), min: 0, label: 'Largest file (MB)' }),
        value: text({ ...forTypes('hidden'), help: 'Sent with every submission' }),
      },
    }),
    submitLabel: text(),
    success: object({ fields: { message: textarea(), redirect: text() } }),
    notify: object({ fields: { to: text(), subject: text() } }),
    confirmation: object({ fields: { enabled: boolean(), subject: text(), message: textarea() } }),
    retentionDays: number({ integer: true, min: 0, default: 90 }),
  },
})
