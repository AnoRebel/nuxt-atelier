import { definePatterns } from '#atelier/server'

export default definePatterns({
  intro: {
    label: 'Intro pair',
    blocks: [
      { id: 'i1', type: 'Headline', props: { heading: 'Pattern headline' } },
      { id: 'i2', type: 'Teasers', props: { items: 'Alpha,Beta' } },
    ],
  },
})
