import { defineCollection, slug, text } from '#atelier/server'

export default defineCollection({
  route: { pattern: { en: '/projects/{slug}', et: '/projektid/{slug}' }, component: 'ProjectPage', layout: 'wide' },
  fields: { name: text({ required: true }), slug: slug({ required: true }) },
})
