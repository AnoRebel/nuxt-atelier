// A Lucide icon as inline SVG, from the set bundled at build time (module.ts lists them). The markup comes from
// that set, never from user input.
import { defineComponent, h } from 'vue'
import icons from '#atelier-admin-icons'

type IconData = { body: string, width: number, height: number }

export default defineComponent({
  name: 'AtelierAdminIcon',
  props: { name: { type: String, required: true } },
  setup(props) {
    return () => {
      const icon = (icons as Record<string, IconData>)[props.name.replace(/^i-lucide-/, '')]
      return icon
        ? h('svg', { 'class': 'app-icon', 'xmlns': 'http://www.w3.org/2000/svg', 'viewBox': `0 0 ${icon.width} ${icon.height}`, 'aria-hidden': 'true', 'focusable': 'false', 'innerHTML': icon.body })
        : null
    }
  },
})
