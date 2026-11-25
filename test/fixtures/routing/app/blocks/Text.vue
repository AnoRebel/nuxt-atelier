<script setup lang="ts">
import { defineBlock, richText } from '#atelier'

defineBlock({ label: 'Text' })
defineProps({ body: richText({ required: true }) })
</script>

<template>
  <AtelierRichText
    :value="body"
    class="text"
  />
</template>
