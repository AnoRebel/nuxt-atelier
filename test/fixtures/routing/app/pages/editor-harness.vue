<script setup lang="ts">
// Test probe: stands in for the visual editor, framing a page and collecting what its bridge says
const src = String(useRoute().query.src ?? '')
</script>

<template>
  <iframe
    id="frame"
    :src="src"
    title="Preview"
    style="width: 900px; height: 700px; border: 0"
  />
</template>
