<script setup lang="ts">
import { computed } from "vue";
import type { ProgressVariant, ProgressSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: ProgressVariant;
    size?: ProgressSize;
    value?: number;
    max?: number;
    label: string;
    class?: string;
  }>(),
  { variant: "bar", size: "md", value: 0, max: 100 },
);

const indeterminate = computed(() => props.variant === "indeterminate");
const safeMax = computed(() => (props.max > 0 ? props.max : 100));
const now = computed(() => Math.max(0, Math.min(safeMax.value, props.value)));
const pct = computed(() => (now.value / safeMax.value) * 100);
const classes = computed(() =>
  cn("cn-progress", `cn-progress--${props.variant}`, `cn-progress--size-${props.size}`, props.class),
);
</script>

<template>
  <div
    data-slot="progress"
    :data-material="props.material"
    role="progressbar"
    :aria-label="label"
    :aria-valuemin="indeterminate ? undefined : 0"
    :aria-valuemax="indeterminate ? undefined : safeMax"
    :aria-valuenow="indeterminate ? undefined : now"
    :class="classes"
  >
    <div class="cn-progress__fill" :style="indeterminate ? undefined : { inlineSize: `${pct}%` }" />
  </div>
</template>
