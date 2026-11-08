<script setup lang="ts">
import { defineBlock, text } from '#atelier'

defineBlock({ label: 'Layer hero' })
defineProps({ title: text() })
</script>

<template>
  <header class="layer-hero">
    {{ title }}
  </header>
</template>
