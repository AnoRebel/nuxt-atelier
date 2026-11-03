import { defineSingleton, text } from '#atelier/server'

export default defineSingleton({
  label: 'Site settings',
  fields: { siteName: text() },
})
