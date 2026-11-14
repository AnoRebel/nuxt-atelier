import { blocks, defineCollection, slug, text } from '#atelier/server'

export default defineCollection({
  versioned: true,
  route: { pattern: '/{slug}' },
  fields: { title: text({ required: true }), slug: slug({ from: 'title', required: true }), content: blocks() },
})
