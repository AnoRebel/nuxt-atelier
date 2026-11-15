<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Hero' })
defineProps({ heading: text({ required: true }) })
</script>

<template>
  <h1 class="hero">
    {{ heading }}
  </h1>
</template>
