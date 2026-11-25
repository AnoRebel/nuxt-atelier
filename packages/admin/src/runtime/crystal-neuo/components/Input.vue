<script setup lang="ts">
import { computed, useId, type VNode } from "vue";
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

const slots = defineSlots<{
  /** Inside the input's box, at its start, centred on the input: e.g. a search or currency icon. */
  start?: () => VNode[];
  /** Inside the input's box, at its end, centred on the input: e.g. a reveal or clear button. */
  end?: () => VNode[];
}>();

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
const { rootAttrs, controlAttrs } = useControlAttrs();
const inputAttrs = computed(() => ({
  ...controlAttrs.value,
  id: inputId.value,
  class: cn("cn-input", `cn-input--size-${props.size}`, props.error && "cn-input--error"),
  type: props.type,
  placeholder: props.placeholder,
  disabled: props.disabled,
  "aria-invalid": props.error ? true : undefined,
  "aria-describedby": describedBy.value,
}));
</script>

<template>
  <div v-bind="rootAttrs" class="cn-field" data-slot="input-field" :data-material="props.material">
    <label v-if="label" class="cn-field__label" :for="inputId">{{ label }}</label>
    <div v-if="slots.start || slots.end" :class="['cn-input-group', `cn-input-group--size-${props.size}`]">
      <span v-if="slots.start" class="cn-input-group__start"><slot name="start" /></span>
      <input v-bind="inputAttrs" v-model="model" />
      <span v-if="slots.end" class="cn-input-group__end"><slot name="end" /></span>
    </div>
    <input v-else v-bind="inputAttrs" v-model="model" />
    <span v-if="hint && !error" class="cn-field__hint" :id="hintId">{{ hint }}</span>
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
