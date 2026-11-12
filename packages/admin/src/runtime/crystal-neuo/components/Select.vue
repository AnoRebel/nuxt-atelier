<script setup lang="ts">
import { computed, useId } from "vue";
import type { SelectSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: SelectSize;
    label?: string;
    error?: string;
    options: SelectOption[];
    id?: string;
    disabled?: boolean;
  }>(),
  { size: "md" },
);

const model = defineModel<string>({ default: "" });

const autoId = useId();
const selectId = computed(() => props.id ?? autoId);
const msgId = computed(() => `${selectId.value}-msg`);
const selectClass = computed(() =>
  cn("cn-select__native", `cn-input--size-${props.size}`, props.error && "cn-select__native--error"),
);
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <div v-bind="rootAttrs" class="cn-field" data-slot="select-field" :data-material="props.material">
    <label v-if="label" class="cn-field__label" :for="selectId">{{ label }}</label>
    <div class="cn-select">
      <select
        v-bind="controlAttrs"
        :id="selectId"
        v-model="model"
        :class="selectClass"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? msgId : undefined"
      >
        <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
          {{ o.label }}
        </option>
      </select>
      <svg class="cn-select__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </div>
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
