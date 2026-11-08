<script setup lang="ts">
import { defineBlock, text, useAtelierArea } from '#atelier'

defineBlock({ label: 'Tile', group: 'content' })
defineProps({ label: text({ required: true }) })
// reads what the parent passes to the slot it's in (Pruvious #93)
const area = useAtelierArea<{ side?: string }>()
</script>

<template>
  <div
    class="tile"
    :data-side="area?.props.side"
    :data-in="area && `${area.block.id}.${area.name}`"
    :data-outer="area?.parent && `${area.parent.block.id}.${area.parent.name}:${area.parent.props.side}`"
  >
    {{ label }}
  </div>
</template>
