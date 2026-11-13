// Shared blocks: one block (with what's nested in it) that pages place by reference, so publishing it
// updates every page that uses it. Added when the app has blocks; see SHARED_BLOCK in shared/blocks.ts.
import { blocks, defineCollection, text } from '../../../../../server/define'

export default defineCollection({
  versioned: true,
  labels: { singular: 'Shared block', plural: 'Shared blocks' },
  admin: { icon: 'blocks', columns: ['title'] },
  fields: {
    title: text({ required: true, maxLength: 120 }),
    block: blocks({ required: true, minItems: 1, maxItems: 1 }),
  },
})
