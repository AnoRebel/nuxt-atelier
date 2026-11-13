// Entry templates saved by editors from an entry: a new entry of `type` can start from `data` (with the
// templates the app defines on its collections, `templates`).
import { defineCollection, json, text, textarea } from '../../../../../server/define'

export default defineCollection({
  labels: { singular: 'Template', plural: 'Templates' },
  admin: { icon: 'files', columns: ['title', 'type'] },
  fields: {
    title: text({ required: true, maxLength: 120 }),
    description: textarea(),
    type: text({ required: true }),
    data: json({ required: true }),
  },
})
