<script setup lang="ts">
// Regression check for vue-tsc 3.3.12/3.3.13 (vuejs/language-tools#6237):
// imported bindings in template closures, plus slot props and v-for variables
// in nested scoped slots, must stay typed. If they degrade to `any`, the
// expect-error lines below become unused and vue-tsc fails.
import { STATUS } from './constants'
import TypedList from './TypedList.vue'

const groups = [{ name: 'a', rows: [{ id: 1, label: 'x' }] }]
</script>

<template>
  <div
    v-for="group in groups"
    :key="group.name"
  >
    <TypedList :items="group.rows">
      <template #item="{ item: row }">
        <TypedList :items="[row.id, row.label]">
          <template #item="{ item: cell, index }">
            <button @click="() => console.log(STATUS.DRAFT, row.label, cell)">
              {{ group.rows.map(r => `${STATUS.DRAFT}:${r.id}`) }}
            </button>
            {{ group.name.toUpperCase() }} {{ row.label.toUpperCase() }} {{ cell }} {{ index.toFixed() }}
            <!-- @vue-expect-error group is not any -->
            {{ group.missing }}
            <!-- @vue-expect-error row is not any -->
            {{ row.missing }}
            <!-- @vue-expect-error cell is number | string -->
            {{ cell.toFixed() }}
          </template>
        </TypedList>
      </template>
    </TypedList>
  </div>
</template>
