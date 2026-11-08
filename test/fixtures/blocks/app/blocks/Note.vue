<script setup lang="ts">
// Plain scoped CSS, no UI library
import { defineBlock, textarea } from '#atelier'

defineBlock({ label: 'Note' })
defineProps({ body: textarea() })
</script>

<template>
  <aside class="note">
    {{ body }}
  </aside>
</template>

<style scoped>
.note { border-left: 4px solid #e8a33d; padding: 0.5rem 1rem; }
</style>
