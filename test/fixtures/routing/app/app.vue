<script setup lang="ts">
// the app's own layout name and props, from the query, reach the catch-all page's layout too
const route = useRoute()
const name = computed(() => typeof route.query.layout === 'string' ? route.query.layout : undefined)
const tagline = computed(() => typeof route.query.tagline === 'string' ? route.query.tagline : undefined)
</script>

<template>
  <NuxtLayout
    :name="name"
    :tagline="tagline"
  >
    <NuxtPage />
  </NuxtLayout>
</template>
