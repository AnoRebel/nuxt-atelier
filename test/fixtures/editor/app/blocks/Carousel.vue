<script setup lang="ts">
import { defineBlock } from '#atelier'

// shows one slide at a time: edited through its proxy in the editor's preview
defineBlock({ label: 'Carousel', areas: { slides: { label: 'Slides', allow: ['Card'] } }, editor: { proxy: true } })
</script>

<template>
  <div class="carousel">
    <slot name="slides" />
  </div>
</template>

<style>
.carousel > :not(:first-child) { display: none; }
</style>
