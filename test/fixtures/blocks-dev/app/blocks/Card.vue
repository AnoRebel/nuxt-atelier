<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Card' })
defineProps({ heading: text() })
</script>

<template>
  <article>{{ heading }}</article>
</template>
