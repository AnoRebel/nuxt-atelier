import { blocks, defineCollection, media, seo, slug, text } from '#atelier/server'

// drafts and publishing
export default defineCollection({
  versioned: true,
  route: {
    pattern: '/blog/{slug}',
    // Article structured data on each post's page
    jsonLd: ({ data, url, createdAt, updatedAt }) => ({ '@type': 'Article', 'headline': data.title, 'url': url, 'datePublished': createdAt, 'dateModified': updatedAt, 'author': { '@type': 'Organization', 'name': 'Atelier </script> test' } }),
  },
  fields: { title: text({ required: true }), slug: slug({ required: true }), cover: media(), content: blocks(), seo: seo() },
})
