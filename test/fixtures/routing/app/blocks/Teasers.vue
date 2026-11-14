<script setup lang="ts">
import { defineBlock, text } from '#atelier'

// renders nothing while there's nothing to list: the editor shows a placeholder for it
defineBlock({ label: 'Teasers' })
const props = defineProps({ items: text() })
const list = computed(() => (props.items ?? '').split(',').filter(Boolean))
</script>

<template>
  <ul
    v-if="list.length"
    class="teasers"
  >
    <li
      v-for="item in list"
      :key="item"
    >
      {{ item }}
    </li>
  </ul>
</template>
