import { defineSingleton, text } from '#atelier/server'

export default defineSingleton({
  fields: { siteName: text({ required: true, default: 'My site' }), footer: text() },
})
