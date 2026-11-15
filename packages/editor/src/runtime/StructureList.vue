<!-- A list of blocks in the structure tree, and the areas inside each: click or Enter selects, Alt+↑/↓ moves
     a block within its list, Delete removes it; blocks drag to any list that takes them. -->
<script setup lang="ts">
import type { BlockList } from './tree'
import { inject } from 'vue'
import { dndKey } from './dnd'
import StructureList from './StructureList.vue'

defineOptions({ name: 'AtelierEditorStructureList' })
const props = defineProps<{ list: BlockList, selected: string | null, hovered: string | null, depth: number, emptyLabel: string }>()
const emit = defineEmits<{ select: [id: string], hover: [id: string | null], move: [id: string, by: -1 | 1], remove: [id: string] }>()
const dnd = inject(dndKey)!

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
/** Over a block's row: before it in its upper half, after it in its lower. */
function overBlock(event: DragEvent, index: number) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dnd.over(event, { list: props.list.path, index: event.clientY < rect.top + rect.height / 2 ? index : index + 1 })
}
const lineAt = (index: number) => dnd.dropAt.value?.list === props.list.path && dnd.dropAt.value.index === index
</script>

<template>
  <ul
    class="ate-tree"
    :aria-label="list.label"
    :data-list="list.path"
  >
    <li
      v-for="(block, index) in list.blocks"
      :key="block.id"
      class="ate-tree__item"
      :data-drop-before="lineAt(index) ? '' : undefined"
      :data-drop-after="index === list.blocks.length - 1 && lineAt(index + 1) ? '' : undefined"
    >
      <button
        type="button"
        class="ate-tree__block"
        draggable="true"
        :aria-pressed="selected === block.id"
        :data-tree-block="block.id"
        :data-hovered="hovered === block.id ? '' : undefined"
        :style="{ paddingInlineStart: `${0.5 + depth}rem` }"
        @click="emit('select', block.id)"
        @keydown="onKey($event, block.id)"
        @pointerenter="emit('hover', block.id)"
        @pointerleave="emit('hover', null)"
        @dragstart="dnd.start($event, { kind: 'block', id: block.id })"
        @dragend="dnd.end()"
        @dragover.stop="overBlock($event, index)"
        @drop.stop="dnd.drop($event)"
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
          :empty-label="emptyLabel"
          @select="emit('select', $event)"
          @hover="emit('hover', $event)"
          @move="(id, by) => emit('move', id, by)"
          @remove="emit('remove', $event)"
        />
      </template>
    </li>
    <li
      v-if="!list.blocks.length"
      class="ate-tree__empty"
      :style="{ paddingInlineStart: `${0.5 + depth}rem` }"
      :data-drop-before="lineAt(0) ? '' : undefined"
      data-drop-zone
      @dragover.stop="dnd.over($event, { list: list.path, index: 0 })"
      @drop.stop="dnd.drop($event)"
    >
      {{ emptyLabel }}
    </li>
  </ul>
</template>
