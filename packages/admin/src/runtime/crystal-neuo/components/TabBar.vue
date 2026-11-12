<script setup lang="ts">
import { computed } from "vue";
import type { Material } from "../contract/index";
import { cn } from "./cn";

export interface TabBarItem {
  label: string;
  href: string;
  current?: boolean;
}

const props = defineProps<{
  material?: Material;
  /** Accessible name of the navigation landmark. */
  label: string;
  items: TabBarItem[];
  class?: string;
}>();

const classes = computed(() => cn("cn-tabbar", props.class));
</script>

<template>
  <nav data-slot="tab-bar" :data-material="props.material" :aria-label="label" :class="classes">
    <a
      v-for="(it, i) in items"
      :key="it.href"
      :href="it.href"
      class="cn-tabbar__item"
      :aria-current="it.current ? 'page' : undefined"
    >
      <!-- Decorative icon slot per item: <template #icon-0>…</template>. -->
      <span v-if="$slots[`icon-${i}`]" class="cn-tabbar__icon" aria-hidden="true"
        ><slot :name="`icon-${i}`"
      /></span>
      <span>{{ it.label }}</span>
    </a>
  </nav>
</template>
