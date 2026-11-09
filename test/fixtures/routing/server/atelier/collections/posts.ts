import { blocks, defineCollection, slug, text } from '#atelier/server'

// drafts and publishing
export default defineCollection({
  versioned: true,
  route: { pattern: '/blog/{slug}' },
  fields: { title: text({ required: true }), slug: slug({ required: true }), content: blocks() },
})
