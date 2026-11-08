import { defineCollection, multiSelect, number, relation, select, slug, text } from '#atelier/server'

export default defineCollection({
  fields: {
    title: text({ required: true, maxLength: 80 }),
    slug: slug({ unique: true }),
    category: select({ options: ['news', 'guides'] }),
    views: number({ integer: true, min: 0 }),
    tags: multiSelect({ options: ['vue', 'nuxt'] }),
    author: relation({ to: 'authors', onDelete: 'nullify' }),
    internalNotes: text(),
  },
})
