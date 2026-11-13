// Patterns saved by editors: block arrangements inserted as independent copies (with the app's own,
// from `server/atelier/patterns.ts`). Added when the app has blocks.
import { blocks, defineCollection, text, textarea } from '../../../../../server/define'

export default defineCollection({
  labels: { singular: 'Pattern', plural: 'Patterns' },
  admin: { icon: 'blocks', columns: ['title'] },
  fields: {
    title: text({ required: true, maxLength: 120 }),
    description: textarea(),
    blocks: blocks({ required: true, minItems: 1 }),
  },
})
