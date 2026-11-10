<script setup lang="ts">
import { defineBlock, media } from '#atelier'

defineBlock({ label: 'Photo' })
const props = defineProps({ image: media({ required: true }) })
// the item's details come with the entry the page renders
const { data } = useAtelierRouteEntry()
const item = computed(() => data.value?.media?.[props.image])
</script>

<template>
  <figure class="photo">
    <AtelierImage
      v-if="item"
      :media="item"
      ratio="1:1"
      sizes="50vw"
    />
  </figure>
</template>
