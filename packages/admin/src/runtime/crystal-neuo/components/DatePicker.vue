<script setup lang="ts">
import { computed, useId } from "vue";
import type { DatePickerSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: DatePickerSize;
    label?: string;
    error?: string;
    id?: string;
    min?: string;
    max?: string;
    disabled?: boolean;
  }>(),
  { size: "md" },
);

const model = defineModel<string>({ default: "" });

const autoId = useId();
const dpId = computed(() => props.id ?? autoId);
const msgId = computed(() => `${dpId.value}-msg`);
const inputClass = computed(() =>
  cn("cn-input", `cn-input--size-${props.size}`, props.error && "cn-input--error"),
);
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <div v-bind="rootAttrs" class="cn-field" data-slot="date-field" :data-material="props.material">
    <label v-if="label" class="cn-field__label" :for="dpId">{{ label }}</label>
    <input
      v-bind="controlAttrs"
      :id="dpId"
      v-model="model"
      type="date"
      :class="inputClass"
      :min="min"
      :max="max"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? msgId : undefined"
    />
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
