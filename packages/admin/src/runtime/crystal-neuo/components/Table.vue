<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed } from "vue";
import type { TableVariant, TableSize, Material } from "../contract/index";
import { cn } from "./cn";

export interface TableColumn<R> {
  key: keyof R & string;
  header: string;
}

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: TableVariant;
    size?: TableSize;
    columns: TableColumn<T>[];
    rows: T[];
    caption?: string;
    class?: string;
  }>(),
  { variant: "default", size: "md" },
);

const classes = computed(() =>
  cn("cn-table", `cn-table--${props.variant}`, `cn-table--size-${props.size}`, props.class),
);
</script>

<template>
  <table data-slot="table" :data-material="props.material" :class="classes">
    <caption v-if="caption">
      {{
        caption
      }}
    </caption>
    <thead>
      <tr>
        <th v-for="c in columns" :key="c.key" scope="col">{{ c.header }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, i) in rows" :key="i">
        <td v-for="c in columns" :key="c.key">{{ row[c.key] }}</td>
      </tr>
    </tbody>
  </table>
</template>
