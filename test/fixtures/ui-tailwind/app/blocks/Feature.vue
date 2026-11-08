<script setup lang="ts">
import { defineBlock, text, textarea } from '#atelier'

defineBlock({ label: 'Feature' })
defineProps({ title: text({ required: true }), body: textarea() })
</script>

<template>
  <article class="rounded-xl border border-gray-200 p-6 shadow-sm">
    <h3 class="font-semibold text-gray-900">
      {{ title }}
    </h3>
    <p class="mt-2 text-gray-600">
      {{ body }}
    </p>
  </article>
</template>
