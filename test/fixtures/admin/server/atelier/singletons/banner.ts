import { defineSingleton, text } from '#atelier/server'

// a version per locale: the message translated, the link the same in all
export default defineSingleton({
  label: 'Banner',
  localized: true,
  fields: { message: text(), link: text({ shared: true }) },
})
