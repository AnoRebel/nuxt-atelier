import { definePatterns } from '#atelier/server'

export default definePatterns({
  pricing: {
    label: 'Pricing section',
    blocks: [
      { id: 'p1', type: 'Badge', props: { label: 'Popular', tone: 'warning' } },
      { id: 'p2', type: 'Quote', props: { text: 'Worth every penny' } },
    ],
  },
})
