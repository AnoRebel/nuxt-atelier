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
    const config = useAtelierConfig() as { mediaWidths?: number[], mediaProvider?: string, siteUrl?: string }
    const widths = config.mediaWidths ?? []
    const provider = config.mediaProvider ? { template: config.mediaProvider, site: config.siteUrl ?? '' } : undefined
    return () => {
      const img = imageAttributes(props.media, props, widths, provider)
      // not resizable, or an image service choosing the format itself: just the image
      if (!('srcset' in img) || provider)
        return h('img', { ...img, loading: props.loading, decoding: 'async' })
      const sources = (['avif', 'webp'] as const).map(format =>
        h('source', { type: `image/${format}`, srcset: imageAttributes(props.media, { ...props, format }, widths, provider).srcset, sizes: img.sizes }))
      return h('picture', [...sources, h('img', { ...img, loading: props.loading, decoding: 'async' })])
    }
  },
})
