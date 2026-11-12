<script setup lang="ts">
import { computed } from "vue";
import type { AlertVariant, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: AlertVariant;
    title?: string;
    live?: boolean;
    class?: string;
  }>(),
  { variant: "info" },
);

const classes = computed(() => cn("cn-alert", `cn-alert--${props.variant}`, props.class));
</script>

<template>
  <div data-slot="alert" :data-material="props.material" :role="live ? 'alert' : 'note'" :class="classes">
    <svg class="cn-alert__icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M10 6v5M10 14h.01" stroke="currentColor" stroke-width="1.5" fill="none" />
    </svg>
    <div>
      <strong v-if="title">{{ title }}</strong>
      <div><slot /></div>
    </div>
  </div>
</template>
