<script setup lang="ts">
import { defineBlock, richText } from '#atelier'

// rich text, editable in place in the editor's preview
defineBlock({ label: 'Text' })
defineProps({ body: richText() })
</script>

<template>
  <AtelierRichText
    :value="body"
    field="body"
    class="text"
  />
</template>
