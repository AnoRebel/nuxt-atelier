import { blocks, date, defineCollection, media, slug, text, textarea } from '#atelier/server'

// Blog posts at /blog/<slug>, in their own layout
export default defineCollection({
  versioned: true,
  route: { pattern: '/blog/{slug}', layout: 'post' },
  admin: { icon: 'pin', columns: ['title', 'publishedOn'] },
  fields: {
    title: text({ required: true }),
    slug: slug({ from: 'title', required: true }),
    headline: text({ help: 'Shown as the post\'s heading; the title when empty' }),
    description: textarea({ help: 'The summary in the blog\'s list' }),
    cover: media({ help: 'The image in the blog\'s list' }),
    author: text(),
    publishedOn: date({ required: true, label: 'Published on' }),
    content: blocks({ allow: ['Image', 'Prose'] }),
  },
})
