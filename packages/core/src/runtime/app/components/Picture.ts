// <AtelierPicture :media="…" ratio="4:3" />: a <picture> offering AVIF and WebP variants before the
// original format, with the same sizing as <AtelierImage>.
import type { PropType } from 'vue'
import type { MediaSummary } from '../../shared/query'
import type { ImageRatio } from '../media'
import { defineComponent, h } from 'vue'
import { useAtelierConfig } from '../composables/useAtelierConfig'
import { imageAttributes } from '../media'

export default defineComponent({
  name: 'AtelierPicture',
  props: {
    media: { type: Object as PropType<MediaSummary>, required: true },
    ratio: { type: String as PropType<ImageRatio>, default: undefined },
    sizes: { type: String, default: undefined },
    alt: { type: String, default: undefined },
    locale: { type: String, default: undefined },
    loading: { type: String as PropType<'lazy' | 'eager'>, default: 'lazy' },
  },
  setup(props) {
    const widths = (useAtelierConfig() as { mediaWidths?: number[] }).mediaWidths ?? []
    return () => {
      const img = imageAttributes(props.media, props, widths)
      if (!('srcset' in img)) // not resizable: just the image
        return h('img', { ...img, loading: props.loading, decoding: 'async' })
      const sources = (['avif', 'webp'] as const).map(format =>
        h('source', { type: `image/${format}`, srcset: imageAttributes(props.media, { ...props, format }, widths).srcset, sizes: img.sizes }))
      return h('picture', [...sources, h('img', { ...img, loading: props.loading, decoding: 'async' })])
    }
  },
})
