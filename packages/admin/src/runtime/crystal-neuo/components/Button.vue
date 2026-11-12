<script setup lang="ts">
import { computed } from "vue";
import type { ButtonVariant, ButtonSize, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    class?: string;
  }>(),
  { variant: "primary", size: "md", loading: false, disabled: false, type: "button" },
);

defineEmits<{ click: [event: MouseEvent] }>();

const classes = computed(() =>
  cn("cn-button", `cn-button--${props.variant}`, `cn-button--size-${props.size}`, props.class),
);
</script>

<template>
  <button
    data-slot="button"
    :data-material="props.material"
    :class="classes"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
