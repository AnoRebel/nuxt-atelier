import { defineBlock, select, text } from '#atelier'
import { CtaButton } from '#components'

export default defineBlock({
  component: CtaButton,
  label: 'Cta',
  fields: { label: text({ required: true }), to: text({ required: true }) },
  options: { variant: select({ options: ['solid', 'outline'], default: 'solid' }) },
})
