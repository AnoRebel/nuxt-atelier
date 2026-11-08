<script setup lang="ts">
// Stands in for the visual editor's preview, which sets this for editing renders
useAtelierPreview().value = true
const route = useRoute()
const { data } = await useAtelierEntry('pages', () => route.params.id as string)
</script>

<template>
  <main>
    <AtelierBlocks :blocks="data?.data.content" />
  </main>
</template>
