<script setup lang="ts">
import { defineBlock, media } from '#atelier'

defineBlock({ label: 'Image', icon: 'image' })
const props = defineProps({ image: media({ required: true }) })
const { data } = useAtelierRouteEntry()
const item = computed(() => props.image ? data.value?.media?.[props.image] : undefined)
</script>

<template>
  <SiteContainer class="content-block">
    <AtelierPicture
      v-if="item"
      :media="item"
      sizes="(max-width: 48.75rem) 100vw, 48.75rem"
      class="block h-auto w-full max-w-content overflow-hidden rounded-md [&_img]:h-auto [&_img]:w-full"
    />
  </SiteContainer>
</template>
