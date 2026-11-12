<script setup lang="ts">
import { computed } from "vue";
import type { BadgeVariant, BadgeSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{ material?: Material; variant?: BadgeVariant; size?: BadgeSize; class?: string }>(),
  {
    variant: "neutral",
    size: "md",
  },
);

const classes = computed(() =>
  cn("cn-badge", `cn-badge--${props.variant}`, `cn-badge--size-${props.size}`, props.class),
);
</script>

<template>
  <span data-slot="badge" :data-material="props.material" :class="classes"><slot /></span>
</template>
