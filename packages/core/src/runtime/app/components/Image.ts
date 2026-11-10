// <AtelierImage :media="entry.media[entry.data.cover]" ratio="16:9" sizes="(min-width: 768px) 50vw, 100vw" />:
// a responsive <img> of a media item, sized so nothing shifts as it loads. Lazy by default.
import type { PropType } from 'vue'
import type { MediaSummary } from '../../shared/query'
import type { ImageFormat, ImageRatio } from '../media'
import { defineComponent, h } from 'vue'
import { useAtelierConfig } from '../composables/useAtelierConfig'
import { imageAttributes } from '../media'

export default defineComponent({
  name: 'AtelierImage',
  props: {
    media: { type: Object as PropType<MediaSummary>, required: true },
    ratio: { type: String as PropType<ImageRatio>, default: undefined },
    format: { type: String as PropType<ImageFormat>, default: undefined },
    sizes: { type: String, default: undefined },
    alt: { type: String, default: undefined },
    locale: { type: String, default: undefined },
    loading: { type: String as PropType<'lazy' | 'eager'>, default: 'lazy' },
  },
  setup(props) {
    const config = useAtelierConfig() as { mediaWidths?: number[], mediaProvider?: string, siteUrl?: string }
    const widths = config.mediaWidths ?? []
    const provider = config.mediaProvider ? { template: config.mediaProvider, site: config.siteUrl ?? '' } : undefined
    return () => h('img', { ...imageAttributes(props.media, props, widths, provider), loading: props.loading, decoding: 'async' })
  },
})
