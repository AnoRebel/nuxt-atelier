import { defineCollection, text } from '#atelier/server'

export default defineCollection({
  admin: { icon: 'users', group: 'People' },
  fields: { name: text({ required: true }) },
})
