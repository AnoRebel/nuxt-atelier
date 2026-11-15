// <AtelierBlocks :blocks="entry.data.content" />: renders a block list. Each block's fields and options
// are its component's props; each nested area is the component's slot of the same name, so block
// components need nothing from Nuxt Atelier. Components load lazily, per block type.
import type { Component, PropType, Slot, VNode } from 'vue'
import type { BlockInstance } from '../../shared/infer'
import type { AtelierArea } from '../composables/useAtelierArea'
import { computed, defineAsyncComponent, defineComponent, h, inject, onBeforeUnmount, onMounted, onUpdated, provide, ref } from 'vue'
import { blocks as registry } from '#atelier-blocks'
import { areaKey } from '../composables/useAtelierArea'
import { frameChecks } from '../editor/frames'
import { useAtelierPreview } from '../composables/useAtelierPreview'

const components = new Map<string, Component>()

/**
 * Editing only: shows a block, and when it renders no element (a list with nothing to list, say) a stand-in
 * naming it, carrying its markers, so the editor can still select, move and delete it.
 */
const BlockFrame = defineComponent({
  name: 'AtelierBlockFrame',
  props: { id: { type: String, required: true }, type: { type: String, required: true } },
  setup(props, { slots }) {
    const empty = ref(false)
    let child: VNode | undefined
    // after each render: did the block put an element on the page?
    const check = () => {
      const el = child?.el as Node | null | undefined
      empty.value = !el || el.nodeType !== 1
    }
    onMounted(() => {
      check()
      frameChecks.add(check)
    })
    onUpdated(check)
    onBeforeUnmount(() => frameChecks.delete(check))
    return () => {
      child = slots.default?.()[0]
      return [
        child,
        empty.value
          ? h('div', { 'data-at-block': props.id, 'data-at-type': props.type, 'data-at-placeholder': '', 'style': 'min-height:2.5rem;padding:.5rem;border:1px dashed #94a3b8;color:#64748b;font:500 .875rem/1.5 system-ui,sans-serif' }, `${props.type} (nothing to show)`)
          : null,
      ]
    }
  },
})
const warned = new Set<string>()

const PROXY = 'display:block;margin:.5rem 0;padding:.5rem;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;color:#0f172a;font:500 .875rem/1.5 system-ui,sans-serif'
const PROXY_AREA = 'display:block;margin:.25rem 0 0;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em'

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
      if (!preview.value)
        return h(componentOf(block.type), { key: block.id, ...values }, slots)
      // proxy mode (a carousel, tabs: blocks that show part of their content at a time): a plain stand-in
      // in its place, every area's blocks shown in order, so each can be seen, selected and moved
      if (entry.proxy) {
        return h('div', { 'key': block.id, 'data-at-block': block.id, 'data-at-type': block.type, 'data-at-proxy': '', 'style': PROXY }, [
          h('span', { style: 'display:block;font-weight:600' }, entry.proxy.label),
          ...entry.areas.flatMap(area => [h('span', { style: PROXY_AREA }, entry.proxy!.areas[area] ?? area), slots[area]!()]),
        ])
      }
      // editing: the markers the editor maps the page by, and a stand-in when the block renders nothing
      const rendered = h(componentOf(block.type), { ...values, 'data-at-block': block.id, 'data-at-type': block.type }, slots)
      return h(BlockFrame, { key: block.id, id: block.id, type: block.type }, () => rendered)
    })
  },
})

export default AtelierBlocks
