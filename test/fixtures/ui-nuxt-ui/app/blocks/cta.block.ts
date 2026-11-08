// Nuxt UI's UButton as the block's component: its `label`, `to` and `variant` props are the block's fields
import { defineBlock, select, text } from '#atelier'
import { UButton } from '#components'

export default defineBlock({
  component: UButton,
  label: 'Cta',
  fields: { label: text({ required: true }), to: text({ required: true }) },
  options: { variant: select({ options: ['solid', 'outline'], default: 'solid' }) },
})
