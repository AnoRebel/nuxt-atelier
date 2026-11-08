<script setup lang="ts">
import { defineBlock } from '#atelier'

defineBlock({ label: 'Columns', group: 'layout', areas: { left: { min: 1 }, right: {} } })
</script>

<template>
  <div class="columns">
    <div class="left">
      <slot name="left" />
    </div>
    <div class="right">
      <slot name="right" />
    </div>
  </div>
</template>
