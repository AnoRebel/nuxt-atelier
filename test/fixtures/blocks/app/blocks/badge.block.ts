// A schema-file block: any component, here one from the app's components
import { defineBlock, select, text } from '#atelier'
import { SiteBadge } from '#components'

export default defineBlock({
  component: SiteBadge,
  label: 'Badge',
  fields: { label: text({ required: true }) },
  options: { tone: select({ options: ['info', 'warning'], default: 'info' }) },
})
