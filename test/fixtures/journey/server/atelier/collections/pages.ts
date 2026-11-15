import { blocks, defineCollection, seo, slug, text } from '#atelier/server'

// pages in English and German, drafted, then published or scheduled; found by the site's search
export default defineCollection({
  localized: true,
  versioned: true,
  route: { pattern: '/{slug}' },
  fields: {
    title: text({ required: true, searchable: 3 }),
    slug: slug({ from: 'title', required: true }),
    seo: seo(),
    content: blocks({ searchable: true }),
  },
})
