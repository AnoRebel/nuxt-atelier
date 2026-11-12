<script setup lang="ts">
import { computed } from "vue";
import type { ListVariant, ListSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{ material?: Material; variant?: ListVariant; size?: ListSize; class?: string }>(),
  {
    variant: "plain",
    size: "md",
  },
);

const classes = computed(() =>
  cn("cn-list", `cn-list--${props.variant}`, `cn-list--size-${props.size}`, props.class),
);
</script>

<template>
  <ul data-slot="list" :data-material="props.material" :class="classes">
    <slot />
  </ul>
</template>
