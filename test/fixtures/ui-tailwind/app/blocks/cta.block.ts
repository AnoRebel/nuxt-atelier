import { defineBlock, select, text } from '#atelier'
import { CtaLink } from '#components'

export default defineBlock({
  component: CtaLink,
  label: 'Cta',
  fields: { label: text({ required: true }), to: text({ required: true }) },
  options: { variant: select({ options: ['solid', 'outline'], default: 'solid' }) },
})
