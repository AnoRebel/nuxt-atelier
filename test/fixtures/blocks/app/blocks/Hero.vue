<script setup lang="ts">
import { defineBlock, select, text } from '#atelier'

defineBlock({
  label: 'Hero',
  group: 'layout',
  options: { variant: select({ options: ['light', 'dark'], default: 'light' }) },
  areas: { items: { allow: ['Card', 'Note', 'group:media'], deny: ['tag:heavy'], max: 3 } },
})
defineProps({
  title: text({ required: true, maxLength: 80 }),
  variant: { type: String, default: 'light' },
})
</script>

<template>
  <section
    class="hero"
    :class="`hero--${variant}`"
  >
    <h1>
      <AtelierField name="title">
        {{ title }}
      </AtelierField>
    </h1>
    <div class="hero__items">
      <slot name="items" />
    </div>
  </section>
</template>
