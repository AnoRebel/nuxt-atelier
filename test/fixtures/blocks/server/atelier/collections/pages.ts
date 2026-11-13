import { blocks, defineCollection, text } from '#atelier/server'

export default defineCollection({
  fields: { title: text({ required: true }), content: blocks() },
  templates: {
    landing: { label: 'Landing page', data: { title: 'New landing page', content: [{ id: 't1', type: 'Badge', props: { label: 'Launch', tone: 'warning' } }] } },
  },
})
