<script setup lang="ts">
defineProps<{ entry: { locale?: string, fallbacks?: Record<string, string>, data: { title: string, subtitle?: string | null } } }>()
const localePath = useAtelierLocalePath()
</script>

<template>
  <article>
    <h1>{{ entry.data.title }}</h1>
    <p class="subtitle">
      {{ entry.data.subtitle }}
    </p>
    <p class="locale">
      {{ entry.locale ?? 'every' }} {{ JSON.stringify(entry.fallbacks ?? {}) }}
    </p>
    <a
      class="german"
      :href="localePath('/produkte/stuhl', 'de')"
    >Deutsch</a>
  </article>
</template>
