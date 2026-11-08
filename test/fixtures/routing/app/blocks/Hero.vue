<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Hero' })
defineProps({ title: text({ required: true }) })
</script>

<template>
  <h1 class="hero">
    {{ title }}
  </h1>
</template>
