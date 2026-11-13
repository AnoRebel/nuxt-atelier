import { defineCollection, text } from '#atelier/server'

// a localized collection: one version per locale, linked as translations
export default defineCollection({
  localized: true,
  versioned: true,
  fields: { title: text({ required: true }), code: text({ shared: true }) },
})
