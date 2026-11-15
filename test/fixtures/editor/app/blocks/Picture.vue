<script setup lang="ts">
import { defineBlock, media } from '#atelier'

// a block with an image: files dropped on it in the preview are uploaded and set as `image`
defineBlock({ label: 'Picture' })
defineProps({ image: media({ accept: ['image/*'] }) })
</script>

<template>
  <figure
    class="picture"
    :data-image="image"
  >
    {{ image ? 'An image' : 'No image yet' }}
  </figure>
</template>
