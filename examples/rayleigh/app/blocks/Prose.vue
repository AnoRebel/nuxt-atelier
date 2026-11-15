<script setup lang="ts">
import { defineBlock, richText } from '#atelier'

defineBlock({ label: 'Text', icon: 'pilcrow' })
defineProps({ text: richText({ required: true }) })
</script>

<template>
  <SiteContainer class="content-block">
    <AtelierRichText
      :value="text"
      field="text"
      class="prose max-w-content"
    />
  </SiteContainer>
</template>
