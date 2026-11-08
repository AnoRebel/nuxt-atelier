<script setup lang="ts">
import { defineBlock, url } from '#atelier'

defineBlock({ label: 'Video', group: 'media', tags: ['heavy'] })
defineProps({ src: url({ required: true }) })
</script>

<template>
  <video
    class="video"
    :src="src"
  />
</template>
