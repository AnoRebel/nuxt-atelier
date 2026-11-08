<script setup lang="ts">
import { defineBlock, text, textarea } from '#atelier'

defineBlock({ label: 'Feature' })
defineProps({ title: text({ required: true }), body: textarea() })
</script>

<template>
  <article class="feature">
    <h3>{{ title }}</h3>
    <p>{{ body }}</p>
  </article>
</template>

<style scoped>
.feature { border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.5rem; }
.feature h3 { margin: 0; }
.feature p { margin: 0.5rem 0 0; color: #4b5563; }
</style>
