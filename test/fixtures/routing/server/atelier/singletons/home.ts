import { blocks, defineSingleton, text } from '#atelier/server'

export default defineSingleton({
  route: { pattern: '/' },
  fields: { headline: text({ required: true }), content: blocks() },
})
