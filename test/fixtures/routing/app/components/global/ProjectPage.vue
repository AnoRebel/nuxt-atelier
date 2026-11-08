<script setup lang="ts">
defineProps<{ entry: { path: string, data: { name: string } } }>()
</script>

<template>
  <article class="project">
    <h1>{{ entry.data.name }}</h1>
    <p class="path">
      {{ entry.path }}
    </p>
  </article>
</template>
