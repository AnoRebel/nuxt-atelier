<script setup lang="ts">
defineProps<{ label?: string, to?: string, variant?: 'solid' | 'outline' }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="rounded-md px-6 py-2.5 text-sm font-semibold"
    :class="variant === 'outline' ? 'border border-gray-300 text-gray-900' : 'bg-gray-900 text-white'"
  >
    {{ label }}
  </NuxtLink>
</template>
