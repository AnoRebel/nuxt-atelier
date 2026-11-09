<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Event card' })
defineProps({ title: text({ required: true }) })
</script>

<template>
  <article class="event-card">
    {{ title }}
  </article>
</template>
