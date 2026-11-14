<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Card' })
defineProps({ heading: text({ required: true }) })
</script>

<template>
  <article class="card">
    {{ heading }}
  </article>
</template>
