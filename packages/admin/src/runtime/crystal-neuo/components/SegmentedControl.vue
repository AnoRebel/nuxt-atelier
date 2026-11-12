<script setup lang="ts">
import { computed, useId } from "vue";
import type { SegmentedControlVariant, SegmentedControlSize, Material } from "../contract/index";
import { cn } from "./cn";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    material?: Material;
    /** Accessible name of the group (rendered as a visually hidden legend). */
    label: string;
    options: SegmentedOption[];
    /** Radio group name; generated when omitted. */
    name?: string;
    variant?: SegmentedControlVariant;
    size?: SegmentedControlSize;
    class?: string;
  }>(),
  { variant: "default", size: "md" },
);

const model = defineModel<string>();
const autoName = useId();
const groupName = computed(() => props.name ?? autoName);
const selected = computed(() => model.value ?? props.options.find((o) => !o.disabled)?.value ?? "");
const classes = computed(() =>
  cn("cn-segmented", `cn-segmented--${props.variant}`, `cn-segmented--size-${props.size}`, props.class),
);
</script>

<template>
  <!-- Native radios give arrow-key selection, RTL order, and form submission. -->
  <fieldset data-slot="segmented-control" :data-material="props.material" :class="classes">
    <legend>{{ label }}</legend>
    <label v-for="o in options" :key="o.value" class="cn-segmented__item">
      <input
        type="radio"
        class="cn-segmented__input"
        :name="groupName"
        :value="o.value"
        :checked="selected === o.value"
        :disabled="o.disabled"
        @change="model = o.value"
      />
      <span class="cn-segmented__label">{{ o.label }}</span>
    </label>
  </fieldset>
</template>
