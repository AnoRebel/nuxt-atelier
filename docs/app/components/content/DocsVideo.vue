<script setup lang="ts">
// A video in the docs, played with Video.js 10 (its HTML custom elements and default skin):
// ::docs-video{src="/media/clip.mp4" poster="/media/clip-poster.webp" label="What the clip shows"}
import '@videojs/html/video/player'
import '@videojs/html/video/skin'

defineProps<{
  src: string
  poster?: string
  /** What the video shows, for people who can't see it. */
  label: string
  /** Width / height, as CSS `aspect-ratio`. */
  ratio?: string
}>()
</script>

<template>
  <figure class="docs-video">
    <video-player :poster="poster">
      <video-skin :style="{ aspectRatio: ratio ?? '16 / 9' }">
        <video
          :src="src"
          :aria-label="label"
          playsinline
          muted
          loop
          preload="metadata"
        />
      </video-skin>
    </video-player>
    <figcaption v-if="$slots.default">
      <slot mdc-unwrap="p" />
    </figcaption>
  </figure>
</template>

<style scoped>
.docs-video {
  margin-block: 1.5rem;
}
video-skin {
  display: block;
  width: 100%;
  --media-accent-color: var(--ui-primary);
  --media-border-radius: var(--ui-radius);
}
video-skin:not(:defined) {
  visibility: hidden;
}
figcaption {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  text-align: center;
}
</style>
