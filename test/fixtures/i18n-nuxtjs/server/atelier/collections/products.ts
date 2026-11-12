import { defineCollection, slug, text } from '#atelier/server'

// localized, with a URL pattern per locale: /products/chair, /produkte/stuhl
export default defineCollection({
  localized: true,
  route: { pattern: { en: '/products/{slug}', de: '/produkte/{slug}' }, component: 'ProductPage' },
  fields: { slug: slug({ required: true }), title: text({ required: true }), subtitle: text() },
})
