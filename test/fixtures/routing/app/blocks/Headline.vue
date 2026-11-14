<script setup lang="ts">
import { defineBlock, text } from '#atelier'

// its text editable in place, in the editor's preview
defineBlock({ label: 'Headline' })
defineProps({ heading: text({ required: true }) })
</script>

<template>
  <h2 class="headline">
    <AtelierField name="heading">
      {{ heading }}
    </AtelierField>
  </h2>
</template>
