// <AtelierBlocks :blocks="entry.data.content" />: renders a block list. Each block's fields and options
// are its component's props; each nested area is the component's slot of the same name, so block
// components need nothing from Nuxt Atelier. Components load lazily, per block type.
import type { Component, PropType, Slot } from 'vue'
import type { BlockInstance } from '../../shared/infer'
import type { AtelierArea } from '../composables/useAtelierArea'
import { computed, defineAsyncComponent, defineComponent, h, inject, provide } from 'vue'
import { blocks as registry } from '#atelier-blocks'
import { areaKey } from '../composables/useAtelierArea'
import { useAtelierPreview } from '../composables/useAtelierPreview'

const components = new Map<string, Component>()
const warned = new Set<string>()

function componentOf(type: string): Component {
  let component = components.get(type)
  if (!component) {
    component = defineAsyncComponent(registry[type]!.component)
    components.set(type, component)
  }
  return component
}

const AtelierBlocks = defineComponent({
  name: 'AtelierBlocks',
  props: {
    blocks: { type: Array as PropType<BlockInstance[] | null>, default: () => [] },
    // set when rendering a block's area: the area, and the props the block passed to its slot
    area: { type: Object as PropType<Omit<AtelierArea, 'parent'> | null>, default: null },
  },
  setup(props) {
    const preview = useAtelierPreview()
    // a list without `area` (the top of a page, or blocks a block renders itself) starts a new tree
    const parent = inject(areaKey, null)
    provide(areaKey, computed(() => props.area && { ...props.area, parent: parent?.value ?? null }))
    return () => (props.blocks ?? []).map((block) => {
      const entry = registry[block.type]
      if (!entry) {
        // content can outlive its block type: skip it rather than fail the page (the admin offers removal)
        if (!warned.has(block.type)) {
          warned.add(block.type)
          console.warn(`[nuxt-atelier] Skipped a block of unknown type "${block.type}" (id ${block.id}): it's no longer defined`)
        }
        return null
      }
      const values: Record<string, unknown> = { ...block.props }
      const slots: Record<string, Slot> = {}
      for (const area of entry.areas) {
        const nested = Array.isArray(values[area]) ? values[area] as BlockInstance[] : []
        Reflect.deleteProperty(values, area)
        // an empty area passes no slot (so a block can check `$slots.<area>`), except in previews,
        // where the editor needs it as a drop target
        if (nested.length || preview.value) {
          slots[area] = (slotProps: Record<string, unknown> = {}) =>
            [h(AtelierBlocks, { blocks: nested, area: { name: area, props: slotProps, block: { id: block.id, type: block.type } } })]
        }
      }
      const editing = preview.value ? { 'data-at-block': block.id, 'data-at-type': block.type } : {}
      return h(componentOf(block.type), { key: block.id, ...values, ...editing }, slots)
    })
  },
})

export default AtelierBlocks
