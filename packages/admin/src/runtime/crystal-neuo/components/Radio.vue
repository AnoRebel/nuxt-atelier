<script setup lang="ts">
import { computed } from "vue";
import type { RadioSize, Material } from "../contract/index";
import { cn } from "./cn";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    material?: Material;
    name: string;
    label: string;
    options: RadioOption[];
    size?: RadioSize;
    error?: boolean;
    class?: string;
  }>(),
  { size: "md" },
);

const model = defineModel<string>({ default: "" });

const groupClass = computed(() => cn("cn-radiogroup", props.error && "cn-choice--error", props.class));
const choiceClass = computed(() => cn("cn-choice", `cn-choice--size-${props.size}`));
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    :class="groupClass"
    data-slot="radio-group"
    :data-material="props.material"
  >
    <label v-for="o in options" :key="o.value" :class="choiceClass" :for="`${name}-${o.value}`">
      <input
        :id="`${name}-${o.value}`"
        v-model="model"
        type="radio"
        :name="name"
        :value="o.value"
        class="cn-choice__input"
        :disabled="o.disabled"
        :aria-invalid="error ? true : undefined"
      />
      <span class="cn-choice__label">{{ o.label }}</span>
    </label>
  </div>
</template>
