<script setup lang="ts">
// A block option changed in place: the component gets the new value and re-renders
const blocks = ref([{ id: 'h1', type: 'Hero', props: { title: 'Options', variant: 'light' } }])
function toggle() {
  const hero = blocks.value[0]!
  hero.props.variant = hero.props.variant === 'light' ? 'dark' : 'light'
}
</script>

<template>
  <main>
    <button
      id="toggle"
      @click="toggle"
    >
      Toggle
    </button>
    <AtelierBlocks :blocks="blocks" />
  </main>
</template>
