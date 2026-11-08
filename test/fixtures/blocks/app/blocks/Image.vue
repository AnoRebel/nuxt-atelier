<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Image', group: 'media' })
defineProps({ alt: text() })
</script>

<template>
  <figure class="image">
    {{ alt }}
  </figure>
</template>
