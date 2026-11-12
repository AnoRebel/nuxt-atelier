<script setup lang="ts">
import { computed } from "vue";
import type { SkeletonVariant, SkeletonSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{ material?: Material; variant?: SkeletonVariant; size?: SkeletonSize; class?: string }>(),
  { variant: "block", size: "md" },
);

const classes = computed(() =>
  cn("cn-skeleton", `cn-skeleton--${props.variant}`, `cn-skeleton--size-${props.size}`, props.class),
);
</script>

<template>
  <div data-slot="skeleton" :data-material="props.material" aria-hidden="true" :class="classes" />
</template>
