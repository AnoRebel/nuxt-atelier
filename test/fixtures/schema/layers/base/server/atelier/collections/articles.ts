import { defineCollection } from '#atelier/server'

// Overridden by the app's articles collection
export default defineCollection({
  labels: { singular: 'Layer article', plural: 'Layer articles' },
  fields: {},
})
