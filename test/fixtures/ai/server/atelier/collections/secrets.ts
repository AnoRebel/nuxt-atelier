import { defineCollection, text } from '#atelier/server'

export default defineCollection({ fields: { value: text() } })
