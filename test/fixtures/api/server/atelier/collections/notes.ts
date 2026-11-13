import { defineCollection, richText, text } from '#atelier/server'

// site search: a title that counts most, body text that counts least; drafts until published
export default defineCollection({
  versioned: true,
  route: { pattern: '/notes/{slug}' },
  fields: { title: text({ required: true, searchable: 3 }), slug: text({ required: true }), body: richText({ searchable: true }) },
})
