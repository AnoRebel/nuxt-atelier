<script setup lang="ts">
defineProps<{ label?: string, to?: string, variant?: 'solid' | 'outline' }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="cta"
    :class="{ 'cta--outline': variant === 'outline' }"
  >
    {{ label }}
  </NuxtLink>
</template>

<style scoped>
.cta { padding: 0.625rem 1.5rem; border-radius: 0.375rem; background: #111827; color: #fff; text-decoration: none; }
.cta--outline { background: none; color: #111827; border: 1px solid #d1d5db; }
</style>
