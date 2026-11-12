<script setup lang="ts">
import { computed, useId } from "vue";
import type { SliderSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: SliderSize;
    label: string;
    valueText?: string;
    min?: number;
    max?: number;
    step?: number;
    id?: string;
    disabled?: boolean;
  }>(),
  { size: "md", min: 0, max: 100, step: 1 },
);

const model = defineModel<number>({ default: 0 });

const autoId = useId();
const sliderId = computed(() => props.id ?? autoId);
const classes = computed(() => cn("cn-slider", `cn-slider--size-${props.size}`));
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <div v-bind="rootAttrs" :class="classes" data-slot="slider" :data-material="props.material">
    <label class="cn-field__label" :for="sliderId">{{ label }}</label>
    <input
      v-bind="controlAttrs"
      :id="sliderId"
      v-model.number="model"
      type="range"
      class="cn-slider__input"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="label"
      :aria-valuetext="valueText"
    />
  </div>
</template>
