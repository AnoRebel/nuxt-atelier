import { defineCollection, seo, text, textarea } from '#atelier/server'

export default defineCollection({
  fields: { title: text({ required: true }), body: textarea(), notes: textarea(), seo: seo() },
})
