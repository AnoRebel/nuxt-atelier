import { defineCollection, media, relation, slug, text } from '#atelier/server'

// each site's own posts; slugs are unique per site, so both sites can have /posts/hello
export default defineCollection({
  versioned: true,
  route: { pattern: '/posts/{slug}' },
  fields: {
    title: text({ required: true, searchable: 3 }),
    slug: slug({ from: 'title', unique: true, required: true }),
    image: media(),
    tags: relation({ to: 'tags', many: true }),
  },
})
