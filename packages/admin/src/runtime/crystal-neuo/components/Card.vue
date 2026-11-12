<script setup lang="ts">
import { computed } from "vue";
import type { CardVariant, CardSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{ material?: Material; variant?: CardVariant; size?: CardSize; class?: string }>(),
  {
    variant: "glass",
    size: "md",
  },
);

const classes = computed(() =>
  cn("cn-card", `cn-card--${props.variant}`, `cn-card--size-${props.size}`, props.class),
);
</script>

<template>
  <section data-slot="card" :data-material="props.material" :class="classes"><slot /></section>
</template>
