<template>
  <main>
    <h1>Nuxt Atelier playground</h1>
    <p>Database: {{ databaseKind }}</p>
  </main>
</template>

<script setup lang="ts">
const { data: databaseKind } = await useFetch('/api/database-kind')
</script>
