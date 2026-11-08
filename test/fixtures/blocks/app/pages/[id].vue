<script setup lang="ts">
const route = useRoute()
const { data } = await useAtelierEntry('pages', () => route.params.id as string)
</script>

<template>
  <main>
    <AtelierBlocks :blocks="data?.data.content" />
  </main>
</template>
