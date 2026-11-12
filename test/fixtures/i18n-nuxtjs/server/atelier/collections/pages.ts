import { defineCollection, slug, text } from '#atelier/server'

// not localized: one entry, served in every locale
export default defineCollection({
  route: { pattern: '/{slug}', component: 'ProductPage' },
  fields: { slug: slug({ required: true }), title: text({ required: true }) },
})
