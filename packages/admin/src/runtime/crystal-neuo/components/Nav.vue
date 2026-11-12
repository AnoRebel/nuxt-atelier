<script setup lang="ts">
import { computed } from "vue";
import type { NavVariant, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{ material?: Material; variant?: NavVariant; label: string; class?: string }>(),
  {
    variant: "glass",
  },
);

const classes = computed(() => cn("cn-nav", `cn-nav--${props.variant}`, props.class));
</script>

<template>
  <nav data-slot="nav" :data-material="props.material" :aria-label="label" :class="classes"><slot /></nav>
</template>
