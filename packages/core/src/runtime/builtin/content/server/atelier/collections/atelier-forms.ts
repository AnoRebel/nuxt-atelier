// Public forms editors build: their fields and rules, what happens after a submission, and how long
// submissions are kept. Placed with the form block or <AtelierForm>; checked by definitionErrors.
import { boolean, defineCollection, json, number, object, repeater, select, text, textarea } from '../../../../../server/define'
import { FORM_FIELD_TYPES } from '../../../../../shared/forms'

export default defineCollection({
  versioned: true,
  labels: { singular: 'Form', plural: 'Forms' },
  admin: { icon: 'file-text', columns: ['title'] },
  fields: {
    title: text({ required: true, maxLength: 120 }),
    fields: repeater({
      fields: {
        name: text({ required: true, maxLength: 64 }),
        type: select({ options: [...FORM_FIELD_TYPES], required: true, default: 'text' }),
        label: text({ required: true, maxLength: 300 }),
        labels: json(),
        help: text(),
        placeholder: text(),
        required: boolean(),
        options: textarea(),
        min: number(),
        max: number(),
        pattern: text(),
        accept: text(),
        maxSize: number({ min: 0 }),
        value: text(),
      },
    }),
    submitLabel: text(),
    success: object({ fields: { message: textarea(), redirect: text() } }),
    notify: object({ fields: { to: text(), subject: text() } }),
    confirmation: object({ fields: { enabled: boolean(), subject: text(), message: textarea() } }),
    retentionDays: number({ integer: true, min: 0, default: 90 }),
  },
})
