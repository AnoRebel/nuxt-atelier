// An external backend, as a content adapter serves one: the reference memory adapter, with no history
import { blocks, text } from '#atelier/server'
import { createMemoryAdapter } from '../../../../../packages/core/src/adapter'

export const acme = createMemoryAdapter({
  collections: { 'acme-pages': { title: text(), content: blocks() } },
  // the blocks the editor offers for it: a subset of the app's
  blockTypes: [{ type: 'Headline', fields: {} }, { type: 'Card', fields: {} }],
})
