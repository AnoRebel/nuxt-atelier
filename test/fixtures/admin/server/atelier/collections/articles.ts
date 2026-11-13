import { defineCollection, seo, slug, text, textarea } from '#atelier/server'

// routable, with an seo field: the admin shows search and sharing previews and checks
export default defineCollection({
  route: { pattern: '/articles/{slug}' },
  fields: { title: text({ required: true }), slug: slug({ from: 'title', required: true }), excerpt: textarea(), seo: seo() },
})
