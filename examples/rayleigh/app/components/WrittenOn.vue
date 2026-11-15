<script setup lang="ts">
const props = defineProps<{ author?: string | null, date?: string | null }>()
const writtenOn = computed(() => props.date ? new Date(`${props.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null)
</script>

<template>
  <span
    v-if="writtenOn"
    class="block text-dim italic"
  >
    Written on {{ writtenOn }}
    <span v-if="author">by {{ author }}</span>
  </span>
</template>
