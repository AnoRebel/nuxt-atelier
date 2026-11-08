import { defineCollection, relation, text } from '#atelier/server'

export default defineCollection({
  fields: { name: text({ required: true }), email: text(), coauthored: relation({ to: 'articles', many: true, inverse: 'coauthors' }) },
})
