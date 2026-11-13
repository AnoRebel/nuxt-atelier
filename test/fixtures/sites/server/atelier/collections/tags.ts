import { defineCollection, text } from '#atelier/server'

// one set of tags for every site
export default defineCollection({ scope: 'shared', fields: { name: text({ required: true }) } })
