import { defineCollection, text } from '#atelier/server'

export default defineCollection({
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: text() },
})
