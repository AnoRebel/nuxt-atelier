// <AtelierRichText :value="entry.data.body" />: a rich-text field's content, rendered on the server too.
// Links to paths on the site go through NuxtLink; `components` maps node or mark types to the app's own
// components, its Tiptap extensions' (`{ callout: MyCallout }`) or replacing ours (`{ image: MyImage }`).
import type { Component, PropType } from 'vue'
import type { RichTextNode } from '../../shared/rich-text-render'
import { defineComponent, h } from 'vue'
// Nuxt's components aren't registered globally, so resolveComponent('NuxtLink') finds nothing here
import { NuxtLink } from '#components'
import { useAtelierPreview } from '../composables/useAtelierPreview'
import { renderRichText } from '../../shared/rich-text-render'

export default defineComponent({
  name: 'AtelierRichText',
  props: {
    value: { type: Object as PropType<RichTextNode | null>, default: null },
    components: { type: Object as PropType<Record<string, Component>>, default: undefined },
    /** The wrapping element; `false` for none. */
    as: { type: [String, Boolean] as PropType<string | false>, default: 'div' },
    /** The field it shows (of the entry, or the block it's in): the visual editor edits it in place. */
    field: { type: String, default: undefined },
  },
  setup(props) {
    const preview = useAtelierPreview()
    return () => {
      const nodes = renderRichText(props.value, { components: props.components, link: NuxtLink as Component })
      return props.as === false ? nodes : h(props.as, preview.value && props.field ? { 'data-at-field': props.field, 'data-at-rich': '' } : {}, nodes)
    }
  },
})
