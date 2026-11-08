<script setup lang="ts">
defineProps<{ label?: string, tone?: string }>()
</script>

<template>
  <span
    class="badge"
    :data-tone="tone"
  >{{ label }}</span>
</template>
