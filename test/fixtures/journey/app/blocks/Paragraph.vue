<script setup lang="ts">
import { defineBlock, textarea } from '#atelier'

defineBlock({ label: 'Paragraph' })
defineProps({ body: textarea() })
</script>

<template>
  <p class="paragraph">
    {{ body }}
  </p>
</template>
