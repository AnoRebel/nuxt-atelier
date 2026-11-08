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
    :class="variant === 'muted' ? 'bg-gray-100' : 'bg-white'"
  >
    <h1 class="text-5xl font-bold tracking-tight text-gray-900">
      {{ title }}
    </h1>
    <p class="mt-6 text-lg text-gray-600">
      {{ tagline }}
    </p>
    <div class="mt-10 flex justify-center gap-4">
      <slot name="actions" />
    </div>
  </section>
</template>
