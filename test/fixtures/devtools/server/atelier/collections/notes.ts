import { defineCollection, text } from '#atelier/server'

export default defineCollection({ versioned: true, fields: { title: text({ required: true }) } })
