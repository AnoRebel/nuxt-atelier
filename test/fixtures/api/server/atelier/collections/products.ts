import { defineCollection, text } from '#atelier/server'

// localized: one version per locale, the SKU shared by all of them
export default defineCollection({
  localized: true,
  fields: { title: text({ required: true }), subtitle: text(), sku: text({ shared: true }) },
})
