import { defineCollection, text } from '#atelier/server'

export default defineCollection({ fields: { title: text({ required: true }) } })
