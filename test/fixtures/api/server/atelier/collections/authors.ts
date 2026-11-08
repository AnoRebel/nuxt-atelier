import { defineCollection, text } from '#atelier/server'

export default defineCollection({
  fields: { name: text({ required: true }), email: text() },
})
