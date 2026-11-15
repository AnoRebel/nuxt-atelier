<script setup lang="ts">
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group inline-flex items-center gap-2 font-heading text-sm"
  >
    <IconChevronLeft class="size-3.5 transition-transform group-hocus:-translate-x-0.5" />
    <span><slot /></span>
  </NuxtLink>
</template>
