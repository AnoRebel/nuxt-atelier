<!-- A list of blocks in the structure tree, and the areas inside each: click or Enter selects, Alt+↑/↓ moves
     a block within its list, Delete removes it. -->
<script setup lang="ts">
import type { BlockList } from './tree'
import StructureList from './StructureList.vue'

defineOptions({ name: 'AtelierEditorStructureList' })
defineProps<{ list: BlockList, selected: string | null, hovered: string | null, depth: number }>()
const emit = defineEmits<{ select: [id: string], hover: [id: string | null], move: [id: string, by: -1 | 1], remove: [id: string] }>()

function onKey(event: KeyboardEvent, id: string) {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    emit('move', id, event.key === 'ArrowUp' ? -1 : 1)
  }
  else if (event.key === 'Delete') {
    event.preventDefault()
    emit('remove', id)
  }
}
</script>

<template>
  <ul
    class="ate-tree"
    :aria-label="list.label"
    :data-list="list.path"
  >
    <li
      v-for="block in list.blocks"
      :key="block.id"
      class="ate-tree__item"
    >
      <button
        type="button"
        class="ate-tree__block"
        :aria-pressed="selected === block.id"
        :data-tree-block="block.id"
        :data-hovered="hovered === block.id ? '' : undefined"
        :style="{ paddingInlineStart: `${0.5 + depth}rem` }"
        @click="emit('select', block.id)"
        @keydown="onKey($event, block.id)"
        @pointerenter="emit('hover', block.id)"
        @pointerleave="emit('hover', null)"
      >
        {{ block.label }}
      </button>
      <template
        v-for="area in block.areas"
        :key="area.path"
      >
        <p
          class="ate-tree__area"
          :style="{ paddingInlineStart: `${1 + depth}rem` }"
        >
          {{ area.label }}
        </p>
        <StructureList
          :list="area"
          :selected="selected"
          :hovered="hovered"
          :depth="depth + 1"
          @select="emit('select', $event)"
          @hover="emit('hover', $event)"
          @move="(id, by) => emit('move', id, by)"
          @remove="emit('remove', $event)"
        />
      </template>
    </li>
  </ul>
</template>
