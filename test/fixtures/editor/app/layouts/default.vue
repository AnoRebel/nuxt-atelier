<script setup lang="ts">
// the host's layout marks the entry's title, so the editor can change it in place
const { data } = useAtelierRouteEntry<'pages'>()
</script>

<template>
  <div class="layout">
    <AtelierField
      name="title"
      as="h1"
    >
      {{ data?.entry.data.title }}
    </AtelierField>
    <slot />
  </div>
</template>
