import { defineCollection, text } from '#atelier/server'

// localized, in an app with one locale: the admin shows no locale switcher or translation UI
export default defineCollection({ localized: true, fields: { title: text({ required: true }) } })
