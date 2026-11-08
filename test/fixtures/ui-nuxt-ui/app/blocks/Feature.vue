<script setup lang="ts">
import { defineBlock, text, textarea } from '#atelier'

defineBlock({ label: 'Feature' })
defineProps({ title: text({ required: true }), body: textarea() })
</script>

<template>
  <UCard>
    <template #header>
      <h3>{{ title }}</h3>
    </template>
    <p>{{ body }}</p>
  </UCard>
</template>
