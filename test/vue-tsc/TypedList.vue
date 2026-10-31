<script setup lang="ts" generic="T">
defineProps<{ items: T[] }>()
defineSlots<{ item: (props: { item: T, index: number }) => unknown }>()
</script>

<template>
  <ul>
    <li
      v-for="(item, index) in items"
      :key="index"
    >
      <slot
        name="item"
        :item="item"
        :index="index"
      />
    </li>
  </ul>
</template>
