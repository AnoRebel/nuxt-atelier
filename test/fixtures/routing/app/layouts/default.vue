<script setup lang="ts">
defineProps<{ tagline?: string }>()
</script>

<template>
  <div
    class="layout-default"
    :data-tagline="tagline"
  >
    <slot />
  </div>
</template>
