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
  <section
    class="px-6 py-24 text-center"
    :class="{ 'bg-muted': variant === 'muted' }"
  >
    <h1 class="text-5xl font-bold tracking-tight">
      {{ title }}
    </h1>
    <p class="text-muted-foreground mt-6 text-lg">
      {{ tagline }}
    </p>
    <div class="mt-10 flex justify-center gap-4">
      <slot name="actions" />
    </div>
  </section>
</template>
