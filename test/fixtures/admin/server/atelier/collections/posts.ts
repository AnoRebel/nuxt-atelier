import { boolean, date, defineCollection, multiSelect, number, object, relation, repeater, richText, select, slug, text, textarea } from '#atelier/server'
import { geoPoint } from '../fields'

export default defineCollection({
  labels: { singular: 'Post', plural: 'Posts' },
  versioned: true,
  admin: { icon: 'file-text', columns: ['title', 'category'] },
  fields: {
    title: text({ required: true, maxLength: 80 }),
    slug: slug({ from: 'title' }),
    summary: textarea(),
    body: richText(),
    category: select({ options: ['news', 'guides'] }),
    tags: multiSelect({ options: ['vue', 'nuxt'] }),
    rating: number({ integer: true, min: 0, max: 5 }),
    featured: boolean(),
    publishedOn: date(),
    author: relation({ to: 'authors', onDelete: 'nullify' }),
    seo: object({ fields: { title: text(), noindex: boolean() } }),
    location: geoPoint(),
    faq: repeater({ fields: { question: text({ required: true }), answer: textarea() } }),
  },
  templates: {
    announcement: { label: 'Announcement', data: { title: 'We have news', category: 'news', summary: 'What changed, and why.' } },
  },
})
