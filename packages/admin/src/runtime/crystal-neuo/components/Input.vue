<script setup lang="ts">
import { computed, useId } from "vue";
import type { InputSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: InputSize;
    label?: string;
    error?: string;
    hint?: string;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
  }>(),
  { size: "md", type: "text" },
);

const model = defineModel<string>({ default: "" });

const autoId = useId();
const inputId = computed(() => props.id ?? autoId);
const msgId = computed(() => `${inputId.value}-msg`);
const hintId = computed(() => `${inputId.value}-hint`);
const describedBy = computed(
  () =>
    [props.error ? msgId.value : null, props.hint ? hintId.value : null].filter(Boolean).join(" ") ||
    undefined,
);
const inputClass = computed(() =>
  cn("cn-input", `cn-input--size-${props.size}`, props.error && "cn-input--error"),
);
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <div v-bind="rootAttrs" class="cn-field" data-slot="input-field" :data-material="props.material">
    <label v-if="label" class="cn-field__label" :for="inputId">{{ label }}</label>
    <input
      v-bind="controlAttrs"
      :id="inputId"
      v-model="model"
      :class="inputClass"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
    />
    <span v-if="hint && !error" class="cn-field__hint" :id="hintId">{{ hint }}</span>
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
