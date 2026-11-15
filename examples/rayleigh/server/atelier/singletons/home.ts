import { blocks, boolean, defineSingleton, text } from '#atelier/server'

// The home page, at /
export default defineSingleton({
  label: 'Home page',
  route: { pattern: '/' },
  fields: {
    title: text({ required: true }),
    footerBorder: boolean({ label: 'Border above the footer' }),
    content: blocks({ allow: ['PageIntro', 'Portfolio', 'Posts', 'Prose', 'Image'] }),
  },
})
