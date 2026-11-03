<script setup lang="ts">
import { useAtelierConfig as fromAlias } from '#atelier'

// auto-imported
const siteUrl: string = useAtelierConfig().siteUrl
const same: string = fromAlias().siteUrl
// @ts-expect-error private config is not public
void useAtelierConfig().databaseUrl
</script>

<template>
  <div>{{ siteUrl }} {{ same }}</div>
</template>
