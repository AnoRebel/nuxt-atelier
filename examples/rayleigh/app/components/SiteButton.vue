<script setup lang="ts">
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group relative inline-flex h-4 items-center pl-6 font-heading text-sm text-heading transition dark:text-white"
  >
    <span class="absolute top-0 left-0 size-4 rounded-full bg-heading transition group-hocus:scale-75 dark:bg-white" />
    <span class="mt-px"><slot /></span>
  </NuxtLink>
</template>
