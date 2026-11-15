<script setup lang="ts">
// A page of the app showing content an adapter serves (server/utils/acme.ts)
const route = useRoute()
const { data: page } = await useFetch(`/api/acme/${route.params.id}`)
</script>

<template>
  <main v-if="page">
    <h1 data-at-field="title">
      {{ page.data.title }}
    </h1>
    <AtelierBlocks :blocks="(page.data.content as never) ?? []" />
  </main>
</template>
