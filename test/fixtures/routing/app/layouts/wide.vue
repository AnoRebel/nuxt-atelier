<script setup lang="ts">
// a host layout reading the entry of the page it wraps
const { data } = useAtelierRouteEntry<'projects'>()
const name = computed(() => data.value?.entry.data.name)
</script>

<template>
  <div
    class="layout-wide"
    :data-entry="name"
  >
    <slot />
  </div>
</template>
