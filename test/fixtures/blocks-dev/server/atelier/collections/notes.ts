import { defineCollection, text } from '#atelier/server'

// Edited by the dev type refresh test: a field is added while `nuxt dev` runs
export default defineCollection({ fields: { title: text() } })
