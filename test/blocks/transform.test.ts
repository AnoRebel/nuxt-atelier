import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { transformBlockSfc } from '../../packages/core/src/blocks/transform'

const hero = `<template>
  <section :class="variant"><h1>{{ title }}</h1><p v-for="tag in tags" :key="tag">{{ tag }}</p><slot name="items" /></section>
</template>

<script setup>
import { defineBlock, multiSelect, select, text } from '#atelier'
import { computed } from 'vue'

defineBlock({
  label: 'Hero',
  options: { variant: select({ options: ['light', 'dark'], default: 'light' }) },
  areas: { items: { max: 3 } },
})
const props = defineProps({
  title: text({ required: true, default: 'Welcome' }),
  tags: multiSelect({ options: ['a', 'b'], default: ['a'] }),
  variant: { type: String, default: 'light' },
})
const upper = computed(() => props.title.toUpperCase())
</script>
`

describe('the block transform', () => {
  it('removes the macro, rewrites field helpers into plain props, and drops unused #atelier imports', () => {
    const result = transformBlockSfc(hero, '/app/blocks/Hero.vue')!
    expect(result.code).toContain(`const props = defineProps({
  title: { type: null, default: "Welcome" },
  tags: { type: null, default: () => (["a"]) },
  variant: { type: String, default: 'light' },
})`)
    expect(result.code).not.toContain('defineBlock')
    expect(result.code).not.toContain('#atelier')
    expect(result.code).toContain('import { computed } from \'vue\'')
    expect(result.code).toContain('<template>') // the rest of the SFC is untouched
    expect(result.map.sources).toEqual(['/app/blocks/Hero.vue'])
    expect(result.map.mappings.length).toBeGreaterThan(0)
  })

  it('keeps #atelier imports still used elsewhere', () => {
    const code = `<script setup>\nimport { defineBlock, text, useAtelierConfig } from '#atelier'\ndefineBlock({})\ndefineProps({ a: text() })\nconst config = useAtelierConfig()\n</script>`
    expect(transformBlockSfc(code, '/b/A.vue')!.code).toContain('import { useAtelierConfig } from \'#atelier\'')
  })

  it('drops a helper import whose name is also a prop, so the template sees the prop', () => {
    // in <script setup>, an imported `text` would shadow the prop `text` in the template
    const code = `<script setup>\nimport { defineBlock, text } from '#atelier'\ndefineBlock({})\nconst props = defineProps({ text: text() })\nconsole.log(props.text)\n</script>\n<template><p>{{ text }}</p></template>`
    expect(transformBlockSfc(code, '/b/Quote.vue')!.code).not.toContain('#atelier')
  })

  it('leaves components that aren\'t blocks alone', () => {
    expect(transformBlockSfc('<script setup>\ndefineProps({ a: String })\n</script>', '/b/Plain.vue')).toBeUndefined()
  })

  it('gives a component whose props behave like ordinary Vue props', async () => {
    const { code } = transformBlockSfc(hero, '/app/blocks/Hero.vue')!
    const { descriptor } = parse(code, { filename: 'Hero.vue' })
    const compiled = compileScript(descriptor, { id: 'hero', inlineTemplate: true })
    const dir = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.tmp-'))
    const file = join(dir, 'Hero.mjs')
    writeFileSync(file, compiled.content)
    const Hero = await import(pathToFileURL(file).href).then(m => m.default).finally(() => rmSync(dir, { recursive: true }))

    expect(Object.keys(Hero.props)).toEqual(['title', 'tags', 'variant'])
    expect(await renderToString(createSSRApp(Hero, { title: 'Hello', tags: ['x', 'y'], variant: 'dark' })))
      .toBe('<section class="dark"><h1>Hello</h1><!--[--><p>x</p><p>y</p><!--]--><!--[--><!--]--></section>')
    // defaults apply, and each instance gets its own copy of an array default
    expect(await renderToString(createSSRApp(Hero))).toContain('<h1>Welcome</h1><!--[--><p>a</p>')
    const first = Hero.props.tags.default()
    first.push('mutated')
    expect(Hero.props.tags.default()).toEqual(['a'])
  })
})
