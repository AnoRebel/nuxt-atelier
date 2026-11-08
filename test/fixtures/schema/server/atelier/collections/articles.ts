import { defineCollection, relation, repeater, richText, select, text } from '#atelier/server'

export default defineCollection({
  labels: { singular: 'Article', plural: 'Articles' },
  route: { pattern: '/articles/{title}' },
  fields: {
    title: text({ required: true }),
    status: select({ options: ['draft', { value: 'published', label: 'Published' }], required: true }),
    body: richText(),
    tags: relation({ to: 'tags', many: true }),
    author: relation({ to: 'authors' }),
    faq: repeater({ fields: { question: text({ required: true }), answer: richText() } }),
  },
})
