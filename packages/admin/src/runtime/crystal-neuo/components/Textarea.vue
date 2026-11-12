<script setup lang="ts">
import { computed, useId } from "vue";
import type { TextareaSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: TextareaSize;
    label?: string;
    error?: string;
    hint?: string;
    id?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
  }>(),
  { size: "md" },
);

const model = defineModel<string>({ default: "" });

const autoId = useId();
const taId = computed(() => props.id ?? autoId);
const msgId = computed(() => `${taId.value}-msg`);
const hintId = computed(() => `${taId.value}-hint`);
const describedBy = computed(
  () =>
    [props.error ? msgId.value : null, props.hint ? hintId.value : null].filter(Boolean).join(" ") ||
    undefined,
);
const taClass = computed(() =>
  cn("cn-textarea", `cn-input--size-${props.size}`, props.error && "cn-textarea--error"),
);
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <div v-bind="rootAttrs" class="cn-field" data-slot="textarea-field" :data-material="props.material">
    <label v-if="label" class="cn-field__label" :for="taId">{{ label }}</label>
    <textarea
      v-bind="controlAttrs"
      :id="taId"
      v-model="model"
      :class="taClass"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
    />
    <span v-if="hint && !error" class="cn-field__hint" :id="hintId">{{ hint }}</span>
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
