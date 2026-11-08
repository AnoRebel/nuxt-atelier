<script setup lang="ts">
// Server-rendered with the visitor's session: the content API applies their permissions
const { data } = await useAtelierQuery('articles', { filter: { category: { eq: 'guides' } }, sort: ['title'], fields: ['title'] })
</script>

<template>
  <ul>
    <li
      v-for="article in data?.items"
      :key="article.id"
      class="article"
    >
      {{ article.data.title }}
    </li>
  </ul>
</template>
