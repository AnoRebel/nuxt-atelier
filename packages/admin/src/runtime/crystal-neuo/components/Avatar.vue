<script setup lang="ts">
import { computed } from "vue";
import type { AvatarVariant, AvatarSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: AvatarVariant;
    size?: AvatarSize;
    src?: string;
    name: string;
    class?: string;
  }>(),
  { variant: "circle", size: "md" },
);

const classes = computed(() =>
  cn("cn-avatar", `cn-avatar--${props.variant}`, `cn-avatar--size-${props.size}`, props.class),
);
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join(""),
);
</script>

<template>
  <span data-slot="avatar" :data-material="props.material" :class="classes">
    <img v-if="src" :src="src" :alt="name" />
    <span v-else role="img" :aria-label="name">{{ initials }}</span>
  </span>
</template>
