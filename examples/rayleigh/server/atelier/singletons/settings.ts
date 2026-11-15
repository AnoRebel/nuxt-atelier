import { defineSingleton, repeater, select, text } from '#atelier/server'

// What every page shows: the menu, the footer and where the blog lives
export default defineSingleton({
  label: 'Settings',
  admin: { icon: 'settings' },
  fields: {
    menu: repeater({
      label: 'Menu',
      fields: { label: text({ required: true }), link: text({ required: true, help: 'A path on the site (/about) or a web address' }) },
    }),
    copyrightText: text({ required: true, label: 'Copyright text' }),
    socialMedia: repeater({
      label: 'Social media',
      fields: {
        icon: select({ required: true, options: [{ value: 'github', label: 'GitHub' }, { value: 'x', label: 'X' }, { value: 'discord', label: 'Discord' }] }),
        link: text({ required: true }),
        title: text({ help: 'Shown on hover' }),
      },
    }),
    blogPath: text({ required: true, label: 'Blog page', help: 'The page listing the posts: the back link on each post goes there' }),
  },
})
