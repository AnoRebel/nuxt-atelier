import { date, defineCollection, text } from '#atelier/server'
import { geoPoint } from '../../../../fields'

export default defineCollection({
  fields: { title: text({ required: true }), startsOn: date({ required: true }), venue: geoPoint({ required: true }) },
})
