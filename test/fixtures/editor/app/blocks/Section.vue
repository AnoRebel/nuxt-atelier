<script setup lang="ts">
import { defineBlock, text } from '#atelier'

// a block with an area that takes cards only
defineBlock({ label: 'Section', areas: { items: { allow: ['Card'] } } })
defineProps({ heading: text() })
</script>

<template>
  <section class="section">
    <h3>{{ heading }}</h3>
    <slot name="items" />
  </section>
</template>
