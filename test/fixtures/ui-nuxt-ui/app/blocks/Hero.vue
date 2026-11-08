<script setup lang="ts">
import { defineBlock, select, text, textarea } from '#atelier'

defineBlock({
  label: 'Hero',
  options: { variant: select({ options: ['default', 'muted'], default: 'default' }) },
  areas: { actions: { allow: ['Cta'], max: 2 } },
})
defineProps({
  title: text({ required: true }),
  tagline: textarea(),
  variant: { type: String, default: 'default' },
})
</script>

<template>
  <UPageHero
    :title="title"
    :description="tagline"
    :class="{ 'bg-muted': variant === 'muted' }"
  >
    <template #links>
      <slot name="actions" />
    </template>
  </UPageHero>
</template>
