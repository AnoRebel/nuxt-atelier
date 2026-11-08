import { describe, expect, it } from 'vitest'
import { BlockDefinitionError, blockNameFromFile, parseBlockFile, parseBlockSfc } from '../../packages/core/src/blocks/parse'

const sfc = (setup: string, extra = '') => `<template>
  <section><h1>{{ title }}</h1><slot name="items" /></section>
</template>

<script setup lang="ts">
import { defineBlock, media, select, text } from '#atelier'
${setup}
</script>
${extra}`

describe('macro-style blocks', () => {
  it('reads the metadata, the field helpers in defineProps, options and areas', () => {
    const parsed = parseBlockSfc(sfc(`defineBlock({
  label: 'Hero',
  group: 'layout',
  tags: ['marketing'],
  options: { variant: select({ options: ['light', 'dark'], default: 'light' }) },
  areas: { items: { allow: ['Card', 'group:media'], deny: ['tag:heavy'], max: 3 } },
})
const props = defineProps({
  title: text({ required: true, maxLength: 80 }),
  image: media({ accept: ['image/*'] }),
  plain: { type: String, default: 'not a field' },
})`), '/app/blocks/marketing-hero.vue')!

    expect(parsed.schema).toEqual({
      name: 'MarketingHero',
      label: 'Hero',
      group: 'layout',
      tags: ['marketing'],
      fields: { title: { type: 'text', required: true, maxLength: 80 }, image: { type: 'media', accept: ['image/*'] } },
      options: { variant: { type: 'select', options: ['light', 'dark'], default: 'light' } },
      areas: { items: { allow: ['Card', 'group:media'], deny: ['tag:heavy'], max: 3 } },
    })
    expect(parsed.component).toEqual({ self: true })
    expect(parsed.props).toHaveLength(2)
  })

  it('takes an explicit name, aliased imports and TypeScript casts', () => {
    const parsed = parseBlockSfc(`<script setup lang="ts">
import { defineBlock, text as t } from '#atelier'
defineBlock({ name: 'Banner', label: \`Banner\`, description: 'Wide' as const })
defineProps({ heading: t({ minLength: -1 }) })
</script>`, '/blocks/x.vue')!
    expect(parsed.schema).toMatchObject({ name: 'Banner', label: 'Banner', description: 'Wide', fields: { heading: { type: 'text', minLength: -1 } } })
  })

  it('isn\'t a block without defineBlock()', () => {
    expect(parseBlockSfc(`<script setup lang="ts">\ndefineProps<{ a: string }>()\n</script>`, '/blocks/Plain.vue')).toBeUndefined()
    expect(parseBlockSfc(`<template><p /></template>`, '/blocks/NoScript.vue')).toBeUndefined()
  })
})

describe('schema-file blocks', () => {
  it('reads the component import and the fields', () => {
    const parsed = parseBlockFile(`import { UCard } from '#components'
import { defineBlock, text } from '#atelier'

export default defineBlock({
  component: UCard,
  label: 'Card',
  fields: { title: text({ required: true }) },
  options: { variant: select({ options: ['outline', 'soft'] }) },
})
import { select } from '#atelier'`, '/app/blocks/card.block.ts')
    expect(parsed.schema).toMatchObject({ name: 'Card', label: 'Card', fields: { title: { type: 'text', required: true } }, options: { variant: { type: 'select' } } })
    expect(parsed.component).toEqual({ from: '#components', export: 'UCard' })
  })

  it('takes a default import too', () => {
    expect(parseBlockFile(`import Quote from './Quote.vue'\nimport { defineBlock } from '#atelier'\nexport default defineBlock({ component: Quote })`, '/blocks/quote.block.ts').component)
      .toEqual({ from: './Quote.vue', export: 'default' })
  })
})

describe('diagnostics', () => {
  const failure = (run: () => unknown) => {
    try {
      run()
    }
    catch (error) {
      expect(error).toBeInstanceOf(BlockDefinitionError)
      return error as BlockDefinitionError
    }
    throw new Error('expected a BlockDefinitionError')
  }

  it('points at a variable in the metadata, with file, line and column', () => {
    const error = failure(() => parseBlockSfc(sfc(`const label = 'Hero'\ndefineBlock({ label })`), '/app/blocks/Hero.vue'))
    expect(error.message).toBe('[nuxt-atelier] /app/blocks/Hero.vue:8:15: `label` is a variable: block definitions are read without running the code, so write the value in place')
  })

  it.each([
    ['a template string with an expression', 'defineBlock({ label: `Hero ${1}` })', 'has ${…} expressions'],
    ['a spread', 'const base = {}\ndefineBlock({ ...base })', 'only plain `key: value` properties'],
    ['a computed key', 'defineBlock({ [\'label\']: \'x\' })', 'only plain `key: value` properties'],
    ['an unknown option', 'defineBlock({ lable: \'Hero\' })', 'unknown option "lable"'],
    ['a function call', 'defineBlock({ label: String(1) })', '`String(1)` can\'t be read without running the code'],
    ['a regular expression', 'defineBlock({ label: /x/ })', '`/x/` isn\'t supported here'],
    ['a non-helper option', 'defineBlock({ options: { size: 3 } })', 'options.size: expected a field helper'],
    ['a helper not from #atelier', 'const own = (o: object) => o\ndefineBlock({ options: { size: own({}) } })', 'options.size: expected a field helper'],
    ['a helper with a non-static argument', 'const max = 3\ndefineProps({ title: text({ maxLength: max }) })\ndefineBlock({})', '`max` is a variable'],
    ['a bad name', 'defineBlock({ name: \'hero-block\' })', 'must be PascalCase'],
    ['bad area rules', 'defineBlock({ areas: { items: { allow: \'Card\' } } })', 'areas.items.allow: expected a list'],
    ['an unknown area rule', 'defineBlock({ areas: { items: { maximum: 3 } } })', 'unknown rule "maximum"'],
    ['a field and area with one name', 'defineBlock({ areas: { title: {} } })\ndefineProps({ title: text() })', '"title" is both a field and an area'],
    ['defineBlock twice', 'defineBlock({})\ndefineBlock({})', 'defineBlock() appears more than once'],
  ])('refuses %s', (_, setup, message) => {
    expect(failure(() => parseBlockSfc(sfc(setup), '/app/blocks/Hero.vue')).message).toContain(message)
  })

  it('refuses a schema file without an imported component', () => {
    expect(failure(() => parseBlockFile(`import { defineBlock } from '#atelier'\ndefineBlock({ label: 'x' })`, '/b/x.block.ts')).message).toContain('`component` is required')
    expect(failure(() => parseBlockFile(`import { defineBlock } from '#atelier'\nconst C = {}\ndefineBlock({ component: C })`, '/b/x.block.ts')).message).toContain('must be a component imported in this file')
    expect(failure(() => parseBlockFile(`export const x = 1`, '/b/x.block.ts')).message).toContain('must call defineBlock')
  })

  it('names files as blocks', () => {
    expect(['Hero.vue', 'pricing-table.vue', 'call_to_action.block.ts', 'card.block.mjs'].map(blockNameFromFile)).toEqual(['Hero', 'PricingTable', 'CallToAction', 'Card'])
  })
})
