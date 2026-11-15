import { blocks, defineSingleton, text } from '#atelier/server'

// The home page, at /
export default defineSingleton({
  label: 'Home page',
  route: { pattern: '/' },
  fields: {
    title: text({ required: true }),
    content: blocks(),
  },
})
