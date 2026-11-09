import { blocks, defineCollection, media, slug, text } from '#atelier/server'

// drafts and publishing
export default defineCollection({
  versioned: true,
  route: { pattern: '/blog/{slug}' },
  fields: { title: text({ required: true }), slug: slug({ required: true }), cover: media(), content: blocks() },
})
