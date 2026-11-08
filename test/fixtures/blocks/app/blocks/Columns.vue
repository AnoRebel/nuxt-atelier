<script setup lang="ts">
import { ref } from 'vue'
import { defineBlock } from '#atelier'

defineBlock({ label: 'Columns', group: 'layout', areas: { left: { min: 1 }, right: {} } })
// flips the slot props, so a test can see nested blocks follow them
const flipped = ref(false)
</script>

<template>
  <div class="columns">
    <button
      class="flip"
      @click="flipped = !flipped"
    >
      Flip
    </button>
    <div class="left">
      <slot
        name="left"
        :side="flipped ? 'end' : 'start'"
      />
    </div>
    <div
      v-if="$slots.right"
      class="right"
    >
      <slot
        name="right"
        :side="flipped ? 'start' : 'end'"
      />
    </div>
  </div>
</template>
