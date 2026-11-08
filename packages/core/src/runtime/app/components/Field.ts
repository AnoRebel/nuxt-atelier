// <AtelierField name="title" as="h1">{{ title }}</AtelierField>: marks where a field renders, so the
// visual editor can edit it in place. Renders just the element on public pages.
import { defineComponent, h } from 'vue'
import { useAtelierPreview } from '../composables/useAtelierPreview'

export default defineComponent({
  name: 'AtelierField',
  props: {
    name: { type: String, required: true },
    as: { type: String, default: 'span' },
  },
  setup(props, { slots }) {
    const preview = useAtelierPreview()
    return () => h(props.as, preview.value ? { 'data-at-field': props.name } : {}, slots.default?.())
  },
})
