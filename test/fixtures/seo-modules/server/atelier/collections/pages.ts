import { defineCollection, slug, text } from '#atelier/server'

export default defineCollection({
  route: { pattern: '/{slug}' },
  fields: { title: text({ required: true }), slug: slug({ from: 'title', required: true }) },
})
