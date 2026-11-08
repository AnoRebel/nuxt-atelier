<script setup lang="ts">
// aliased: a prop named `text` and an import named `text` would collide in the template
import { defineBlock, text as textField } from '#atelier'

defineBlock({ label: 'Quote', group: 'content' })
defineProps({ text: textField({ required: true }), author: textField() })
</script>

<template>
  <blockquote class="quote">
    {{ text }} <cite>{{ author }}</cite>
  </blockquote>
</template>
