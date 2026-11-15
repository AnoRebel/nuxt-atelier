import { blocks, boolean, defineCollection, slug, text } from '#atelier/server'

// Pages at /<slug>: About, Blog (with the Posts block)…
export default defineCollection({
  versioned: true,
  route: { pattern: '/{slug}' },
  admin: { columns: ['title', 'slug'] },
  fields: {
    title: text({ required: true }),
    slug: slug({ from: 'title', required: true }),
    footerBorder: boolean({ label: 'Border above the footer' }),
    content: blocks({ allow: ['PageIntro', 'Portfolio', 'Posts', 'Prose', 'Image'] }),
  },
})
