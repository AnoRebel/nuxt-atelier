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
    class="hero"
    :class="{ 'hero--muted': variant === 'muted' }"
  >
    <h1>{{ title }}</h1>
    <p>{{ tagline }}</p>
    <div class="hero__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.hero { padding: 6rem 1.5rem; text-align: center; }
.hero--muted { background: #f3f4f6; }
.hero h1 { font-size: 3rem; margin: 0; }
.hero p { margin-top: 1.5rem; color: #4b5563; }
.hero__actions { display: flex; justify-content: center; gap: 1rem; margin-top: 2.5rem; }
</style>
